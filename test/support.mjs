import http from "node:http"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawn } from "node:child_process"

export async function serve(t, handler) {
  const server = http.createServer(async (request, response) => {
    try {
      await handler(request, response)
    } catch (error) {
      response.writeHead(500)
      response.end(String(error))
    }
  })
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  t.after(async () => {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  })
  return `http://127.0.0.1:${server.address().port}`
}

export async function temporaryHome(t) {
  const path = await mkdtemp(join(tmpdir(), "aims-test-"))
  t.after(() => rm(path, { recursive: true, force: true }))
  return path
}

export function environment(home, baseUrl) {
  return {
    ...process.env,
    HOME: home,
    AIMS_API_KEY: "aims_local_test_key",
    AIMS_BASE_URL: baseUrl,
    AIMS_OUTPUT: "",
    AIMS_NO_INPUT: "1",
  }
}

export function runCli(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [new URL("../packages/cli/dist/index.js", import.meta.url).pathname, ...args], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 10_000,
    })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk) => { stdout += chunk })
    child.stderr.on("data", (chunk) => { stderr += chunk })
    child.on("error", reject)
    child.on("close", (code) => resolve({ code, stdout, stderr }))
  })
}

export function json(response, data, status = 200) {
  response.writeHead(status, { "Content-Type": "application/json" })
  response.end(JSON.stringify(data))
}

export async function body(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  return Buffer.concat(chunks)
}

export const failedImage = { id: "failed", url: null, status: "failed", error: "Provider unavailable", credits_refunded: 10 }
export const completedImage = { id: "completed", url: "https://cdn.example.test/workspaces/test/image.png", status: "completed", credits_refunded: 0 }

export function imageBatch(images, success = true) {
  return { success, images, credits_used: images.filter((image) => image.status === "completed").length * 10, credits_remaining: 100 }
}

export const videoResult = {
  success: true,
  video: { id: "video", url: "https://cdn.example.test/workspaces/test/video.mp4", status: "completed", model: "test-model", duration: 5, aspect_ratio: "16:9", audio: false },
  credits_used: 20,
  credits_remaining: 80,
}

export const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6tS0AAAAASUVORK5CYII=", "base64")
