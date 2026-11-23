import assert from "node:assert/strict"
import test from "node:test"
import { mkdir, open, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { body, completedImage, environment, failedImage, imageBatch, json, png, runCli, serve, temporaryHome, videoResult } from "../../../test/support.mjs"

for (const command of ["image", "edit"]) {
  for (const batch of [imageBatch([failedImage]), imageBatch([failedImage], false), imageBatch([completedImage, failedImage])]) {
    test(`${command} preserves results and exits 1 for ${batch.images.length} images, success=${batch.success}`, async (t) => {
      const home = await temporaryHome(t)
      const baseUrl = await serve(t, (_request, response) => json(response, batch))
      const args = [command, "test prompt", ...(command === "edit" ? ["--image-url", completedImage.url] : [])]
      const output = await runCli([...args, "--json"], environment(home, baseUrl))
      assert.equal(output.code, 1)
      const result = JSON.parse(output.stdout)
      assert.deepEqual(result.images, batch.images)
      assert.equal(result.success, batch.images.length > 1)
      assert.match(output.stderr, /image generation\(s\) failed/)
      const urls = await runCli([...args, "--print", "url"], environment(home, baseUrl))
      assert.equal(urls.code, 1)
      assert.equal(urls.stdout, batch.images.length > 1 ? `${completedImage.url}\n` : "")
    })
  }
}

test("successful generations save into existing dotted directories", async (t) => {
  const home = await temporaryHome(t)
  const destination = join(home, "assets.v1")
  await mkdir(destination)
  const baseUrl = await serve(t, (request, response) => {
    if (request.url === "/asset.png") return response.end(png)
    json(response, imageBatch([{ ...completedImage, url: `${baseUrl}/asset.png` }]))
  })
  const output = await runCli(["image", "test", "--output", destination, "--json"], environment(home, baseUrl))
  assert.equal(output.code, 0, output.stderr)
  const result = JSON.parse(output.stdout)
  assert.deepEqual(result.saved, [join(destination, "01-asset.png")])
  assert.deepEqual(await readFile(result.saved[0]), png)
})

test("partial downloads preserve generated URLs and successful saves without regenerating", async (t) => {
  const home = await temporaryHome(t)
  let generations = 0
  const baseUrl = await serve(t, (request, response) => {
    if (request.url === "/ok.png") return response.end(png)
    if (request.url === "/failed.png") return json(response, { error: "Unavailable" }, 503)
    generations++
    json(response, imageBatch([
      { ...completedImage, id: "one", url: `${baseUrl}/ok.png` },
      { ...completedImage, id: "two", url: `${baseUrl}/failed.png` },
    ]))
  })
  const output = await runCli(["image", "test", "--output", join(home, "downloads"), "--json"], environment(home, baseUrl))
  assert.equal(output.code, 1)
  const result = JSON.parse(output.stdout)
  assert.equal(generations, 1)
  assert.equal(result.images.length, 2)
  assert.deepEqual(result.saved, [join(home, "downloads", "01-ok.png")])
  assert.equal(result.download_errors[0].url, `${baseUrl}/failed.png`)
  assert.match(output.stderr, /without regenerating/)
})

test("failed video downloads preserve the paid result in URL-only mode", async (t) => {
  const home = await temporaryHome(t)
  const baseUrl = await serve(t, (request, response) => {
    if (request.url === "/video.mp4") return json(response, { error: "Unavailable" }, 503)
    json(response, { ...videoResult, video: { ...videoResult.video, url: `${baseUrl}/video.mp4` } })
  })
  const output = await runCli(["video", "test", "--output", join(home, "video.mp4"), "--print", "url"], environment(home, baseUrl))
  assert.equal(output.code, 1)
  assert.equal(output.stdout, `${baseUrl}/video.mp4\n`)
})

test("video exits 1 without printing a URL when the API reports an incomplete video", async (t) => {
  const home = await temporaryHome(t)
  const failed = { ...videoResult, success: false, video: { ...videoResult.video, url: null, status: "failed", error: "Provider unavailable" } }
  const baseUrl = await serve(t, (_request, response) => json(response, failed))
  const urls = await runCli(["video", "test", "--print", "url"], environment(home, baseUrl))
  assert.equal(urls.code, 1)
  assert.equal(urls.stdout, "")
  assert.match(urls.stderr, /Provider unavailable/)
  const output = await runCli(["video", "test", "--json"], environment(home, baseUrl))
  assert.equal(output.code, 1)
  assert.deepEqual(JSON.parse(output.stdout).video, failed.video)
})

test("video forwards reference images, first/last frames, and extension URLs", async (t) => {
  const home = await temporaryHome(t)
  let received
  const baseUrl = await serve(t, async (request, response) => {
    received = JSON.parse(await body(request))
    json(response, videoResult)
  })
  const output = await runCli(["video", "test", "--image-urls", "https://example.test/a.png", "--image-urls", "https://example.test/b.png", "--first-frame-url", "https://example.test/start.png", "--last-frame-url", "https://example.test/end.png", "--extend-video-url", "https://example.test/source.mp4", "--json"], environment(home, baseUrl))
  assert.equal(output.code, 0, output.stderr)
  assert.deepEqual(received, {
    prompt: "test",
    image_urls: ["https://example.test/a.png", "https://example.test/b.png"],
    first_frame_url: "https://example.test/start.png",
    last_frame_url: "https://example.test/end.png",
    extend_video_url: "https://example.test/source.mp4",
  })
})

test("malformed integer flags exit 2 before making an API request", async (t) => {
  const home = await temporaryHome(t)
  const output = await runCli(["image", "test", "--n", "1.9oops", "--dry-run", "--json"], environment(home, "http://127.0.0.1:1"))
  assert.equal(output.code, 2)
  assert.equal(output.stdout, "")
  assert.match(output.stderr, /Expected an integer/)
})

test("upload prints the workspace URL and rejects oversized files before networking", async (t) => {
  const home = await temporaryHome(t)
  const source = join(home, "source.png")
  await writeFile(source, png)
  let requests = 0
  const url = "https://cdn.example.test/workspaces/test/source.png"
  const baseUrl = await serve(t, async (request, response) => {
    requests++
    assert.equal(request.url, "/uploads")
    const form = await new Response(await body(request), { headers: { "Content-Type": request.headers["content-type"] } }).formData()
    assert.deepEqual(Buffer.from(await form.get("file").arrayBuffer()), png)
    json(response, { success: true, id: "upload", url })
  })
  const output = await runCli(["upload", source, "--print", "url"], environment(home, baseUrl))
  assert.equal(output.code, 0, output.stderr)
  assert.equal(output.stdout, `${url}\n`)
  const oversized = await open(join(home, "oversized.png"), "w")
  await oversized.truncate(20 * 1024 * 1024 + 1)
  await oversized.close()
  const rejected = await runCli(["upload", join(home, "oversized.png"), "--json"], environment(home, baseUrl))
  assert.equal(rejected.code, 1)
  assert.match(rejected.stderr, /20 MiB/)
  assert.equal(requests, 1)
})

// The API answers 202 while an image is still generating, and 503 with
// status "generating" for a video in recovery. Both are charged if they
// complete, so the CLI must say so instead of reporting a retryable failure.
const pendingImage = { id: "pending-image", url: null, status: "generating", credits_refunded: 0 }

test("images still generating are reported as pending, never as failed work to retry", async (t) => {
  const home = await temporaryHome(t)
  const batch = imageBatch([completedImage, pendingImage])
  const baseUrl = await serve(t, (_request, response) => json(response, batch, 202))
  const output = await runCli(["image", "test", "-n", "2", "--json"], environment(home, baseUrl))
  assert.equal(output.code, 1)
  assert.deepEqual(JSON.parse(output.stdout).images, batch.images)
  assert.match(output.stderr, /1 image\(s\) still generating: pending-image/)
  assert.match(output.stderr, /Do not generate it again/)
  assert.doesNotMatch(output.stderr, /failed/)
})

test("API errors keep the code, media id and the matching next step", async (t) => {
  const home = await temporaryHome(t)
  let reply
  const baseUrl = await serve(t, (_request, response) => json(response, ...reply))
  reply = [{ error: "Video generation is awaiting recovery", media_id: "m-1", status: "generating" }, 503]
  const recovering = await runCli(["video", "test", "--json"], environment(home, baseUrl))
  assert.equal(recovering.code, 1)
  assert.match(recovering.stderr, /awaiting recovery\nmedia_id: m-1\n.*Do not generate it again/)
  reply = [{ error: "Plans start at $19/month.", code: "PAID_PLAN_REQUIRED" }, 402]
  const unpaid = await runCli(["image", "test"], environment(home, baseUrl))
  assert.match(unpaid.stderr, /\(402 PAID_PLAN_REQUIRED\)/)
  assert.match(unpaid.stderr, /needs a paid plan, even with credits left/)
  assert.doesNotMatch(unpaid.stderr, /enough credits/)
  reply = [{ error: "Insufficient credits", required: 60, available: 10 }, 402]
  const broke = await runCli(["image", "test"], environment(home, baseUrl))
  assert.match(broke.stderr, /not have enough credits/)
})

test("media reports a generation by id and exits 1 until it completed", async (t) => {
  const home = await temporaryHome(t)
  const id = "3f0c2a8e-1b7d-4c55-9f0e-6a1b2c3d4e5f"
  let media
  let path
  const baseUrl = await serve(t, (request, response) => {
    path = request.url
    json(response, { success: true, media })
  })
  media = { id, type: "video_generation", status: "generating", url: null, created_at: "t0", updated_at: "t1" }
  const running = await runCli(["media", id, "--print", "url"], environment(home, baseUrl))
  assert.equal(path, `/media/${id}`)
  assert.equal(running.code, 1)
  assert.equal(running.stdout, "")
  assert.match(running.stderr, /Still generating/)
  media = { ...media, status: "completed", url: "https://cdn.example.test/workspaces/test/video.mp4" }
  const done = await runCli(["media", id, "--print", "url"], environment(home, baseUrl))
  assert.equal(done.code, 0, done.stderr)
  assert.equal(done.stdout, `${media.url}\n`)
})

test("logout --revoke disables the saved key before removing it, and keeps it if revocation fails", async (t) => {
  const home = await temporaryHome(t)
  const configPath = join(home, ".aims/config.json")
  let status = 200
  const requests = []
  const baseUrl = await serve(t, (request, response) => {
    requests.push(`${request.method} ${request.url} ${request.headers.authorization}`)
    json(response, status === 200 ? { success: true, revoked: true } : { error: "Database unavailable" }, status)
  })
  const env = { ...environment(home, baseUrl), AIMS_API_KEY: "" }
  const save = () => mkdir(join(home, ".aims"), { recursive: true }).then(() => writeFile(configPath, JSON.stringify({ apiKey: "aims_saved_key" })))
  await save()
  status = 500
  const failed = await runCli(["logout", "--revoke", "--json"], env)
  assert.equal(failed.code, 1)
  assert.equal(JSON.parse(await readFile(configPath, "utf8")).apiKey, "aims_saved_key")
  status = 200
  const revoked = await runCli(["logout", "--revoke", "--json"], env)
  assert.equal(revoked.code, 0, revoked.stderr)
  assert.equal(JSON.parse(revoked.stdout).revoked, true)
  assert.equal(JSON.parse(await readFile(configPath, "utf8")).apiKey, undefined)
  assert.deepEqual(requests, ["DELETE /keys/current Bearer aims_saved_key", "DELETE /keys/current Bearer aims_saved_key"])
})

test("max credits come from --max-credits or AIMS_MAX_CREDITS, and a bad value stops before the API", async (t) => {
  const home = await temporaryHome(t)
  const received = []
  const baseUrl = await serve(t, async (request, response) => {
    received.push(JSON.parse(await body(request)).max_credits)
    json(response, request.url === "/videos/generate" ? videoResult : imageBatch([completedImage]))
  })
  assert.equal((await runCli(["image", "test", "--max-credits", "40"], environment(home, baseUrl))).code, 0)
  assert.equal((await runCli(["video", "test"], { ...environment(home, baseUrl), AIMS_MAX_CREDITS: "150" })).code, 0)
  assert.equal((await runCli(["video", "test", "--max-credits", "90"], { ...environment(home, baseUrl), AIMS_MAX_CREDITS: "150" })).code, 0)
  const bad = await runCli(["image", "test"], { ...environment(home, baseUrl), AIMS_MAX_CREDITS: "lots" })
  assert.equal(bad.code, 2)
  assert.match(bad.stderr, /AIMS_MAX_CREDITS must be a positive number/)
  assert.deepEqual(received, [40, 150, 90])
})

test("keys are never sent over plain HTTP to a non-loopback host", async (t) => {
  const home = await temporaryHome(t)
  const output = await runCli(["whoami"], environment(home, "http://api.example.test/api/v1"))
  assert.equal(output.code, 1)
  assert.match(output.stderr, /must use https:\/\//)
})
