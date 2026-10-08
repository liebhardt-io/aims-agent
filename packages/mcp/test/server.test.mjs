import assert from "node:assert/strict"
import test from "node:test"
import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { body, completedImage, environment, failedImage, imageBatch, json, png, serve, temporaryHome, videoResult } from "../../../test/support.mjs"

async function connect(t, home, baseUrl) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [new URL("../dist/index.js", import.meta.url).pathname],
    env: environment(home, baseUrl),
    stderr: "pipe",
  })
  const client = new Client({ name: "aims-test", version: "1" })
  t.after(() => client.close())
  await client.connect(transport)
  return client
}

test("image tools mark partial and total failures while retaining detailed results", async (t) => {
  const home = await temporaryHome(t)
  let batch
  const baseUrl = await serve(t, (_request, response) => json(response, batch))
  const client = await connect(t, home, baseUrl)
  await client.listTools()
  for (const name of ["generate_image", "edit_image"]) {
    for (const images of [[failedImage], [completedImage, failedImage], [completedImage]]) {
      batch = imageBatch(images)
      const result = await client.callTool({ name, arguments: { prompt: "test", ...(name === "edit_image" ? { image_urls: [completedImage.url] } : {}) } })
      assert.equal(Boolean(result.isError), images.some((image) => image.status === "failed"))
      assert.deepEqual(result.structuredContent.images, images)
      assert.equal(result.structuredContent.success, images.some((image) => image.status === "completed"))
      assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent)
    }
  }
})

test("discovery output schemas preserve model settings after tool discovery", async (t) => {
  const home = await temporaryHome(t)
  const model = {
    id: "fal-ai/nano-banana-pro", name: "Nano Banana Pro", model_type: "text2img", credit_cost: 30,
    description: null, default_advanced_settings: { resolution: "1K" }, available_settings: { resolution: ["1K", "2K"] },
  }
  const baseUrl = await serve(t, (request, response) => {
    if (request.url === "/models") json(response, { status: "ok", workspace_id: "workspace", image_models: [model], video_models: [] })
    else json(response, { status: "ok", workspace_id: "workspace", credits_available: 100, scopes: ["image:generate"], available_models: [model] })
  })
  const client = await connect(t, home, baseUrl)
  await client.listTools()
  const models = await client.callTool({ name: "list_models", arguments: {} })
  assert.deepEqual(models.structuredContent.image_models, [model])
  const account = await client.callTool({ name: "get_account", arguments: {} })
  assert.deepEqual(account.structuredContent.available_models, [model])
})

test("video tools expose and forward every required video source field", async (t) => {
  const home = await temporaryHome(t)
  let received
  const baseUrl = await serve(t, async (request, response) => {
    received = JSON.parse(await body(request))
    json(response, videoResult)
  })
  const client = await connect(t, home, baseUrl)
  const tools = await client.listTools()
  const inputs = tools.tools.find((tool) => tool.name === "generate_video").inputSchema.properties
  for (const field of ["image_url", "image_urls", "first_frame_url", "last_frame_url", "extend_video_url"]) assert.ok(field in inputs)
  const args = {
    prompt: "test",
    model: "fal-ai/veo3.1/fast/first-last-frame-to-video",
    first_frame_url: "https://example.test/start.png",
    last_frame_url: "https://example.test/end.png",
    extend_video_url: "https://example.test/source.mp4",
    image_urls: ["https://example.test/a.png", "https://example.test/b.png"],
  }
  const result = await client.callTool({ name: "generate_video", arguments: args })
  assert.equal(result.isError, undefined)
  assert.deepEqual(received, args)
})

test("upload_image transfers supplied image contents and returns a workspace URL", async (t) => {
  const home = await temporaryHome(t)
  const url = "https://cdn.example.test/workspaces/test/source.png"
  let file
  const baseUrl = await serve(t, async (request, response) => {
    assert.equal(request.url, "/uploads")
    const form = await new Response(await body(request), { headers: { "Content-Type": request.headers["content-type"] } }).formData()
    file = form.get("file")
    json(response, { success: true, id: "upload", url })
  })
  const client = await connect(t, home, baseUrl)
  const result = await client.callTool({ name: "upload_image", arguments: { image_base64: png.toString("base64"), filename: "source.png" } })
  assert.equal(result.isError, undefined)
  assert.deepEqual(result.structuredContent, { success: true, id: "upload", url })
  assert.equal(file.name, "source.png")
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), png)
})

test("upload_image accepts no file paths and rejects nonimages before HTTP", async (t) => {
  const home = await temporaryHome(t)
  const path = join(home, "private.png")
  await writeFile(path, png)
  let requests = 0
  const baseUrl = await serve(t, (_request, response) => { requests++; json(response, {}) })
  const client = await connect(t, home, baseUrl)
  const tools = await client.listTools()
  const inputs = tools.tools.find(tool => tool.name === "upload_image").inputSchema.properties
  assert.equal(inputs.file_path, undefined)
  assert.ok(inputs.image_base64)
  for (const args of [
    { file_path: path },
    { image_base64: path },
    { image_base64: Buffer.from("local credentials fixture").toString("base64") },
    { image_base64: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>").toString("base64") },
    { image_base64: "not base64" },
  ]) {
    const result = await client.callTool({ name: "upload_image", arguments: args })
    assert.equal(result.isError, true)
  }
  assert.equal(requests, 0)
})
