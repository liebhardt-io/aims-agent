import { spawn } from "node:child_process"
import { createHash, randomBytes } from "node:crypto"
import { createServer } from "node:http"

const CALLBACK_TIMEOUT = 5 * 60 * 1000

function endpoint(value: unknown): string {
  if (typeof value !== "string") throw new Error("Invalid OAuth server metadata.")
  const url = new URL(value)
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))) {
    throw new Error("OAuth endpoints must use HTTPS (except loopback servers).")
  }
  if (url.username || url.password) throw new Error("Invalid OAuth endpoint.")
  return url.href
}

async function requestJson(url: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  const response = await fetch(url, { ...init, redirect: "error", signal: init.signal ?? AbortSignal.timeout(30_000) })
  // Never echo OAuth response bodies: they can contain credentials.
  if (!response.ok) throw new Error(`OAuth request failed (HTTP ${response.status}).`)
  const data: unknown = await response.json().catch(() => {
    if (init.signal?.aborted) throw init.signal.reason
    throw new Error("Invalid OAuth JSON response.")
  })
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid OAuth response.")
  return data as Record<string, unknown>
}

function openBrowser(url: string): void {
  const [command, args]: [string, string[]] = process.platform === "darwin"
    ? ["open", [url]]
    : process.platform === "win32"
      ? ["rundll32", ["url.dll,FileProtocolHandler", url]]
      : ["xdg-open", [url]]
  const child = spawn(command, args, { stdio: "ignore" })
  child.on("error", () => process.stderr.write("Could not open a browser; open the URL above manually.\n"))
  child.on("exit", (code) => {
    if (code) process.stderr.write("Could not open a browser; open the URL above manually.\n")
  })
  child.unref()
}

/** Public-client OAuth login. The returned key is validated by the caller before saving. */
export async function webLogin(baseUrl: string, browser = true): Promise<string> {
  const origin = new URL(baseUrl).origin
  const metadata = await requestJson(endpoint(`${origin}/.well-known/oauth-authorization-server`))
  const authorizationEndpoint = endpoint(metadata.authorization_endpoint)
  const registrationEndpoint = endpoint(metadata.registration_endpoint)
  const tokenEndpoint = endpoint(metadata.token_endpoint)
  const state = randomBytes(32).toString("base64url")
  const verifier = randomBytes(32).toString("base64url")
  const challenge = createHash("sha256").update(verifier).digest("base64url")
  const abort = new AbortController()
  let finish!: (result: URL | Error) => void
  const callback = new Promise<URL | Error>((resolve) => { finish = resolve })
  let received = false
  const server = createServer((request, response) => {
    let url: URL
    try {
      url = new URL(request.url ?? "/", "http://127.0.0.1")
    } catch {
      response.writeHead(400).end("Invalid request.")
      return
    }
    if (request.method !== "GET" || url.pathname !== "/callback" || received) {
      response.writeHead(404).end("Not found.")
      return
    }
    received = true
    let error: Error | undefined
    if (url.searchParams.get("state") !== state) error = new Error("OAuth state mismatch; login cancelled.")
    else if (url.searchParams.has("error")) error = new Error("OAuth authorization was denied or cancelled.")
    else if (!url.searchParams.get("code")) error = new Error("OAuth callback is missing an authorization code.")
    response.writeHead(error ? 400 : 200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" })
    response.end(error ? "Login failed. Return to your terminal." : "Authorization received. Return to your terminal to finish login.")
    finish(error ?? url)
  })
  const cancel = () => {
    const error = new Error("Browser login cancelled.")
    abort.abort(error)
    finish(error)
  }
  const timer = setTimeout(() => {
    const error = new Error("Browser login timed out after 5 minutes.")
    abort.abort(error)
    finish(error)
  }, CALLBACK_TIMEOUT)
  process.once("SIGINT", cancel)
  process.once("SIGTERM", cancel)
  server.on("error", (error) => { abort.abort(error); finish(error) })
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject)
      server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolve() })
    })
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Could not start OAuth callback server.")
    const redirectUri = `http://127.0.0.1:${address.port}/callback`
    const registration = await requestJson(registrationEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: "AIMS CLI",
        redirect_uris: [redirectUri],
        grant_types: ["authorization_code"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      }),
      signal: abort.signal,
    })
    if (typeof registration.client_id !== "string" || !registration.client_id) throw new Error("OAuth registration did not return a client ID.")
    const authorization = new URL(authorizationEndpoint)
    for (const [name, value] of Object.entries({
      response_type: "code", client_id: registration.client_id, redirect_uri: redirectUri,
      state, code_challenge: challenge, code_challenge_method: "S256",
    })) authorization.searchParams.set(name, value)
    process.stderr.write(`Open this URL to approve workspace access (expires in 5 minutes):\n${authorization.href}\n`)
    if (browser) openBrowser(authorization.href)
    const result = await callback
    if (result instanceof Error) throw result
    const token = await requestJson(tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code", client_id: registration.client_id,
        redirect_uri: redirectUri, code: result.searchParams.get("code")!, code_verifier: verifier,
      }),
      signal: abort.signal,
    })
    if (typeof token.access_token !== "string" || !token.access_token) throw new Error("OAuth exchange did not return an access token.")
    return token.access_token
  } finally {
    clearTimeout(timer)
    process.off("SIGINT", cancel)
    process.off("SIGTERM", cancel)
    // Close even keep-alive or incomplete connections, on every exit path.
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
      server.closeAllConnections()
    })
  }
}
