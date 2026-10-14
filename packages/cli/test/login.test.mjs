import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { connect } from "node:net"
import { join } from "node:path"
import test from "node:test"
import { body, environment, json, runCli, serve, temporaryHome } from "../../../test/support.mjs"

const key = "aims_oauth_fixture_secret"
const account = { status: "ok", workspace_id: "workspace", credits_available: 100, scopes: [], available_models: [] }

async function fixture(t, { exchangeStatus = 200, accountStatus = 200, registrationStatus = 201, malformedExchange = false, stalledExchange = false } = {}) {
  const seen = { discovery: 0, exchanges: 0, accounts: 0 }
  const origin = await serve(t, async (request, response) => {
    if (request.url === "/.well-known/oauth-authorization-server") {
      seen.discovery++
      return json(response, {
        issuer: origin, authorization_endpoint: `${origin}/authorize`,
        registration_endpoint: `${origin}/register`, token_endpoint: `${origin}/token`,
      })
    }
    if (request.url === "/register") {
      seen.registration = JSON.parse(await body(request))
      return json(response, { client_id: "public-cli" }, registrationStatus)
    }
    if (request.url === "/token") {
      seen.exchanges++
      seen.exchange = Object.fromEntries(new URLSearchParams((await body(request)).toString()))
      seen.contentType = request.headers["content-type"]
      if (stalledExchange) {
        response.writeHead(200, { "Content-Type": "application/json" })
        response.flushHeaders()
        return
      }
      if (malformedExchange) return response.end(key)
      return json(response, { access_token: key, token_type: "Bearer" }, exchangeStatus)
    }
    if (request.url === "/api/v1/images/generate") {
      seen.accounts++
      seen.authorization = request.headers.authorization
      return json(response, accountStatus === 200 ? account : { error: "Invalid key" }, accountStatus)
    }
    json(response, { error: "Unexpected request" }, 404)
  })
  return { origin, seen }
}

// Exercise the published executable, observing only its printed approval URL.
function webCli(t, env, approve, nodeArgs = []) {
  const child = spawn(process.execPath, [...nodeArgs, new URL("../dist/index.js", import.meta.url).pathname,
    "login", "--web", "--no-browser", "--json"], { env, stdio: ["ignore", "pipe", "pipe"], timeout: 10_000 })
  t.after(() => { if (child.exitCode === null) child.kill() })
  let stdout = ""
  let stderr = ""
  let approval
  child.stdout.on("data", (chunk) => { stdout += chunk })
  child.stderr.on("data", (chunk) => {
    stderr += chunk
    const url = stderr.match(/^http:\/\/127\.0\.0\.1:\d+\/authorize\?[^\s]+/m)?.[0]
    if (url && !approval) {
      approval = Promise.resolve().then(() => approve(new URL(url), child))
      approval.catch(() => child.kill())
    }
  })
  return new Promise((resolve, reject) => {
    child.on("error", reject)
    child.on("close", async (code) => {
      try {
        await approval
        resolve({ code, stdout, stderr })
      } catch (error) { reject(error) }
    })
  })
}

function noKeyEnv(home, origin) {
  return { ...environment(home, `${origin}/api/v1`), AIMS_API_KEY: "" }
}

async function callback(url, params = {}) {
  const target = new URL(url.searchParams.get("redirect_uri"))
  target.search = new URLSearchParams({ code: "one-time-code", state: url.searchParams.get("state"), ...params }).toString()
  const response = await fetch(target)
  await response.text()
  return response.status
}

async function assertClosed(redirectUri) {
  await assert.rejects(fetch(redirectUri), /fetch failed/)
}

test("browser login registers a public client, uses S256 PKCE, validates the key and saves mode 0600 without printing it", async (t) => {
  const home = await temporaryHome(t)
  const { origin, seen } = await fixture(t)
  let authorization
  let pendingSocket
  const output = await webCli(t, noKeyEnv(home, origin), async (url) => {
    authorization = url
    const redirect = new URL(url.searchParams.get("redirect_uri"))
    // Incomplete connections must not keep the callback server alive after login.
    pendingSocket = connect(Number(redirect.port), "127.0.0.1")
    t.after(() => pendingSocket.destroy())
    await new Promise((resolve, reject) => { pendingSocket.once("connect", resolve); pendingSocket.once("error", reject) })
    assert.equal(await callback(url), 200)
  })
  assert.equal(output.code, 0, output.stderr)
  assert.equal(seen.discovery, 1)
  assert.deepEqual(seen.registration, {
    client_name: "AIMS CLI", redirect_uris: [authorization.searchParams.get("redirect_uri")],
    grant_types: ["authorization_code"], response_types: ["code"], token_endpoint_auth_method: "none",
  })
  assert.equal(authorization.searchParams.get("response_type"), "code")
  assert.equal(authorization.searchParams.get("client_id"), "public-cli")
  assert.match(authorization.searchParams.get("state"), /^[A-Za-z0-9_-]{43}$/)
  assert.equal(authorization.searchParams.get("code_challenge_method"), "S256")
  assert.match(seen.exchange.code_verifier, /^[A-Za-z0-9_-]{43}$/)
  assert.equal(createHash("sha256").update(seen.exchange.code_verifier).digest("base64url"), authorization.searchParams.get("code_challenge"))
  assert.deepEqual({ ...seen.exchange, code_verifier: undefined }, {
    grant_type: "authorization_code", client_id: "public-cli", redirect_uri: authorization.searchParams.get("redirect_uri"),
    code: "one-time-code", code_verifier: undefined,
  })
  assert.equal(seen.contentType, "application/x-www-form-urlencoded")
  assert.equal(seen.authorization, `Bearer ${key}`)
  assert.equal(seen.accounts, 1)
  const configPath = join(home, ".aims/config.json")
  assert.equal(JSON.parse(await readFile(configPath, "utf8")).apiKey, key)
  assert.equal((await stat(configPath)).mode & 0o777, 0o600)
  assert.equal(JSON.parse(output.stdout).logged_in, true)
  assert.ok(!`${output.stdout}${output.stderr}`.includes(key))
  await assertClosed(authorization.searchParams.get("redirect_uri"))
})

for (const scenario of ["wrong state", "denied", "missing code", "exchange failure", "malformed exchange", "stalled exchange", "validation failure", "signal cancellation", "timeout"]) {
  test(`browser login ${scenario} preserves saved config and closes the callback`, async (t) => {
    const home = await temporaryHome(t)
    await mkdir(join(home, ".aims"))
    const existing = JSON.stringify({ apiKey: "aims_existing_key", baseUrl: "https://existing.example/api/v1" })
    const configPath = join(home, ".aims/config.json")
    await writeFile(configPath, existing, { mode: 0o600 })
    const { origin, seen } = await fixture(t, {
      exchangeStatus: scenario === "exchange failure" ? 400 : 200,
      accountStatus: scenario === "validation failure" ? 401 : 200,
      malformedExchange: scenario === "malformed exchange",
      stalledExchange: scenario === "stalled exchange",
    })
    let redirectUri
    // Advance only the five-minute login timer; no test-only production flag.
    const timerImport = "data:text/javascript," + encodeURIComponent(
      "const original = globalThis.setTimeout; globalThis.setTimeout = (fn, ms, ...args) => original(fn, ms === 300000 ? 500 : ms, ...args)")
    const output = await webCli(t, noKeyEnv(home, origin), async (url, child) => {
      redirectUri = url.searchParams.get("redirect_uri")
      if (scenario === "timeout") return
      if (scenario === "signal cancellation") { child.kill("SIGINT"); return }
      const params = scenario === "wrong state" ? { state: "wrong" }
        : scenario === "denied" ? { error: "access_denied" }
          : scenario === "missing code" ? { code: "" } : {}
      assert.equal(await callback(url, params), ["wrong state", "denied", "missing code"].includes(scenario) ? 400 : 200)
    }, ["timeout", "stalled exchange"].includes(scenario) ? ["--import", timerImport] : [])
    assert.equal(output.code, 1, output.stderr)
    assert.equal(output.stdout, "")
    assert.equal(await readFile(configPath, "utf8"), existing)
    assert.equal(seen.exchanges, ["exchange failure", "malformed exchange", "stalled exchange", "validation failure"].includes(scenario) ? 1 : 0)
    assert.equal(seen.accounts, scenario === "validation failure" ? 1 : 0)
    assert.ok(!output.stderr.includes(key))
    assert.match(output.stderr, ["timeout", "stalled exchange"].includes(scenario) ? /timed out after 5 minutes/ : /state mismatch|denied|missing|HTTP 400|401|cancelled|Invalid OAuth JSON/)
    await assertClosed(redirectUri)
  })
}

test("failed registration closes its allocated callback and saves nothing", async (t) => {
  const home = await temporaryHome(t)
  const { origin, seen } = await fixture(t, { registrationStatus: 400 })
  const output = await runCli(["login", "--web", "--no-browser"], noKeyEnv(home, origin))
  assert.equal(output.code, 1)
  assert.match(output.stderr, /HTTP 400/)
  assert.equal(seen.exchanges, 0)
  await assertClosed(seen.registration.redirect_uris[0])
  await assert.rejects(stat(join(home, ".aims/config.json")), { code: "ENOENT" })
})

test("non-TTY no-key login refuses implicit browser login and paste without touching the server", async (t) => {
  const home = await temporaryHome(t)
  const { origin, seen } = await fixture(t)
  for (const flags of [[], ["--no-browser"], ["--paste"], ["--web", "--paste"]]) {
    const output = await runCli(["login", ...flags], noKeyEnv(home, origin))
    assert.equal(output.code, 2)
    assert.match(output.stderr, /--web|--paste/)
  }
  assert.equal(seen.discovery, 0)
})

test("explicit login key, global key and environment key take priority over browser login", async (t) => {
  const home = await temporaryHome(t)
  const { origin, seen } = await fixture(t)
  const env = { ...noKeyEnv(home, origin), AIMS_API_KEY: "aims_env" }
  for (const [args, expected] of [
    [["--key", "aims_global", "login", "--key", "aims_local", "--web"], "aims_local"],
    [["--key", "aims_global", "login", "--web"], "aims_global"],
    [["login", "--web"], "aims_env"],
  ]) {
    const output = await runCli(args, env)
    assert.equal(output.code, 0, output.stderr)
    assert.equal(seen.authorization, `Bearer ${expected}`)
    assert.equal(JSON.parse(await readFile(join(home, ".aims/config.json"), "utf8")).apiKey, expected)
  }
  assert.equal(seen.discovery, 0)
})
