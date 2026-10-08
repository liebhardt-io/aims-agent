import assert from "node:assert/strict"
import test from "node:test"
import { AimsClient, AimsApiError } from "../dist/index.js"
import { body, json, png, serve } from "../../../test/support.mjs"

test("request deadline stays active after response headers arrive", { timeout: 5000 }, async (t) => {
  const baseUrl = await serve(t, (_request, response) => {
    response.writeHead(200, { "Content-Type": "application/json" })
    response.flushHeaders()
    const timer = setTimeout(() => response.end('{"status":"ok"}'), 2000)
    response.on("close", () => clearTimeout(timer))
  })
  const client = new AimsClient({ apiKey: "test", baseUrl, timeoutMs: 150 })
  await assert.rejects(client.account(), (error) => error instanceof AimsApiError && error.status === 408)
})

test("HTTP errors retain their status after reading the response body", async (t) => {
  const baseUrl = await serve(t, (_request, response) => json(response, { error: "Insufficient credits" }, 402))
  const client = new AimsClient({ apiKey: "test", baseUrl })
  await assert.rejects(client.account(), (error) => error instanceof AimsApiError && error.status === 402 && error.message === "Insufficient credits")
})

test("upload sends a multipart file with the generated boundary and authentication", async (t) => {
  let uploaded
  const baseUrl = await serve(t, async (request, response) => {
    uploaded = {
      path: request.url,
      authorization: request.headers.authorization,
      type: request.headers["content-type"],
      form: await new Response(await body(request), { headers: { "Content-Type": request.headers["content-type"] } }).formData(),
    }
    json(response, { success: true, id: "upload", url: "https://cdn.example.test/workspaces/test/source.png" })
  })
  const client = new AimsClient({ apiKey: "test", baseUrl })
  const result = await client.uploadImage(new Blob([png], { type: "image/png" }), "source.png")
  assert.equal(result.id, "upload")
  assert.equal(uploaded.path, "/uploads")
  assert.equal(uploaded.authorization, "Bearer test")
  assert.match(uploaded.type, /^multipart\/form-data; boundary=/)
  const file = uploaded.form.get("file")
  assert.equal(file.name, "source.png")
  assert.equal(file.type, "image/png")
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), png)
})

test("uploads use the same deadline while reading their response body", { timeout: 5000 }, async (t) => {
  const baseUrl = await serve(t, (_request, response) => {
    response.writeHead(200, { "Content-Type": "application/json" })
    response.flushHeaders()
    const timer = setTimeout(() => response.end('{"success":true}'), 2000)
    response.on("close", () => clearTimeout(timer))
  })
  const client = new AimsClient({ apiKey: "test", baseUrl, timeoutMs: 150 })
  await assert.rejects(client.uploadImage(new Blob([png]), "source.png"), (error) => error instanceof AimsApiError && error.status === 408)
})
