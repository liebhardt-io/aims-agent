import assert from "node:assert/strict"
import test from "node:test"
import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { body, completedImage, environment, failedImage, imageBatch, json, png, serve, temporaryHome, videoResult } from "../../../test/support.mjs"

async function connect(t, home, baseUrl, extraEnv = {}) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [new URL("../dist/index.js", import.meta.url).pathname],
    env: { ...environment(home, baseUrl), ...extraEnv },
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

test("video tools forward every video source field and flag incomplete videos", async (t) => {
  const home = await temporaryHome(t)
  let received
  let reply = videoResult
  const baseUrl = await serve(t, async (request, response) => {
    received = JSON.parse(await body(request))
    json(response, reply)
  })
  const client = await connect(t, home, baseUrl)
  const tools = await client.listTools()
  const inputs = tools.tools.find((tool) => tool.name === "generate_video").inputSchema.properties
  for (const field of ["image_url", "image_urls", "first_frame_url", "last_frame_url", "extend_video_url"]) assert.ok(field in inputs)
  const args = {
    prompt: "test",
    model: "fal-ai/kling-video/o3/pro/image-to-video",
    first_frame_url: "https://example.test/start.png",
    last_frame_url: "https://example.test/end.png",
    extend_video_url: "https://example.test/source.mp4",
    image_urls: ["https://example.test/a.png", "https://example.test/b.png"],
  }
  const result = await client.callTool({ name: "generate_video", arguments: args })
  assert.equal(result.isError, undefined)
  assert.deepEqual(received, args)
  const failed = { ...videoResult, success: false, video: { ...videoResult.video, url: null, status: "failed", error: "Provider unavailable" } }
  reply = failed
  const failure = await client.callTool({ name: "generate_video", arguments: { prompt: "test" } })
  assert.equal(failure.isError, true)
  assert.deepEqual(failure.structuredContent.video, failed.video)
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

test("a generation still running keeps its id and says not to generate it again", async (t) => {
  const home = await temporaryHome(t)
  let reply
  const baseUrl = await serve(t, (_request, response) => json(response, ...reply))
  const client = await connect(t, home, baseUrl)
  const pending = { id: "pending-image", url: null, status: "generating", credits_refunded: 0 }
  reply = [imageBatch([completedImage, pending]), 202]
  const images = await client.callTool({ name: "generate_image", arguments: { prompt: "test", n: 2 } })
  assert.equal(images.isError, true)
  assert.deepEqual(images.structuredContent.images, [completedImage, pending])
  assert.match(images.structuredContent.hint, /Do not generate it again/)
  reply = [{ error: "Video generation is awaiting recovery", media_id: "m-1", status: "generating" }, 503]
  const video = JSON.parse((await client.callTool({ name: "generate_video", arguments: { prompt: "test" } })).content[0].text)
  assert.equal(video.media_id, "m-1")
  assert.equal(video.status, "generating")
  assert.match(video.error, /awaiting recovery/)
  assert.doesNotMatch(video.error, /try again/i)
  reply = [{ error: "An unexpected error occurred during video generation" }, 500]
  const outage = JSON.parse((await client.callTool({ name: "generate_video", arguments: { prompt: "test" } })).content[0].text)
  assert.match(outage.error, /try again/)
})

test("402 without a paid plan points to billing, not to the balance", async (t) => {
  const home = await temporaryHome(t)
  const baseUrl = await serve(t, (_request, response) => json(response, { error: "Plans start at $19/month.", code: "PAID_PLAN_REQUIRED" }, 402))
  const client = await connect(t, home, baseUrl)
  const result = await client.callTool({ name: "generate_image", arguments: { prompt: "test" } })
  const payload = JSON.parse(result.content[0].text)
  assert.equal(result.isError, true)
  assert.equal(payload.code, "PAID_PLAN_REQUIRED")
  assert.match(payload.hint, /paid plan, even with credits left/)
  assert.equal(payload.next, undefined)
})

test("get_media reads one generation by id; generations report progress and honor the credit cap", async (t) => {
  const home = await temporaryHome(t)
  const requests = []
  const id = "3f0c2a8e-1b7d-4c55-9f0e-6a1b2c3d4e5f"
  const media = { id, type: "image_generation", status: "completed", url: completedImage.url, created_at: "t0", updated_at: "t1" }
  const baseUrl = await serve(t, async (request, response) => {
    const sent = request.method === "POST" ? JSON.parse(await body(request)) : undefined
    requests.push([request.method, request.url, sent?.max_credits, sent?.aspect_ratio])
    if (request.url.startsWith("/media/")) return json(response, { success: true, media })
    setTimeout(() => json(response, imageBatch([completedImage])), 300)
  })
  const client = await connect(t, home, baseUrl, { AIMS_MAX_CREDITS: "50" })
  const found = await client.callTool({ name: "get_media", arguments: { id } })
  assert.equal(found.isError, undefined)
  assert.deepEqual(found.structuredContent, { success: true, media })
  const invalid = await client.callTool({ name: "get_media", arguments: { id: "../keys/current" } })
  assert.equal(invalid.isError, true)
  const progress = []
  const edited = await client.callTool(
    { name: "edit_image", arguments: { prompt: "test", image_urls: [completedImage.url] } },
    undefined,
    { onprogress: (update) => progress.push(update) },
  )
  assert.equal(edited.isError, undefined)
  assert.ok(progress.length >= 1)
  assert.match(progress[0].message, /Editing image/)
  await client.callTool({ name: "generate_image", arguments: { prompt: "test", max_credits: 20 } })
  assert.deepEqual(requests, [
    ["GET", `/media/${id}`, undefined, undefined],
    ["POST", "/images/generate", 50, "auto"],
    ["POST", "/images/generate", 20, undefined],
  ])
})

test("model discovery accepts catalog rows without a label or price", async (t) => {
  const home = await temporaryHome(t)
  const model = { id: "fal-ai/nano-banana-pro", name: null, model_type: "text2img", credit_cost: null }
  const baseUrl = await serve(t, (_request, response) => json(response, { status: "ok", workspace_id: "w", image_models: [model], video_models: [] }))
  const client = await connect(t, home, baseUrl)
  const result = await client.callTool({ name: "list_models", arguments: {} })
  assert.equal(result.isError, undefined)
  assert.deepEqual(result.structuredContent.image_models, [model])
})
