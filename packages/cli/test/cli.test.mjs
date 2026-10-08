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
