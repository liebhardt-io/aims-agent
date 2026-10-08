import assert from "node:assert/strict"
import test from "node:test"
import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import { imageBlobFromBase64, MAX_IMAGE_UPLOAD_BYTES, readImageFile } from "../dist/index.js"
import { png, temporaryHome } from "../../../test/support.mjs"

test("explicit CLI file uploads use content-derived MIME", async (t) => {
  const home = await temporaryHome(t)
  const path = join(home, "image.unknown")
  await writeFile(path, png)
  const { file } = await readImageFile(path)
  assert.equal(file.type, "image/png")
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), png)
})

function isoImage(major, compatible) {
  const bytes = Buffer.alloc(16 + compatible.length * 4)
  bytes.writeUInt32BE(bytes.length, 0)
  bytes.write("ftyp", 4)
  bytes.write(major, 8)
  compatible.forEach((brand, index) => bytes.write(brand, 16 + index * 4))
  return bytes
}

test("ISO-BMFF major and compatible brands preserve HEIC and AVIF MIME", () => {
  for (const [bytes, mime] of [
    [isoImage("heix", ["mif1", "heic"]), "image/heic"],
    [isoImage("mif1", ["avif"]), "image/avif"],
    [isoImage("avif", ["mif1"]), "image/avif"],
  ]) assert.equal(imageBlobFromBase64(bytes.toString("base64")).type, mime)
})

test("base64 image inputs reject malformed, disguised and oversized data", () => {
  for (const value of ["", "data:image/png;base64," + png.toString("base64"), "a===", "YWJj$", Buffer.from("local test credentials").toString("base64"), Buffer.alloc(MAX_IMAGE_UPLOAD_BYTES + 1).toString("base64")]) {
    assert.throws(() => imageBlobFromBase64(value))
  }
})

test("local uploads reject empty, oversized, and disguised non-image files", async (t) => {
  const home = await temporaryHome(t)
  for (const [name, bytes] of [["empty.png", Buffer.alloc(0)], ["secret.png", Buffer.from("local credentials fixture")], ["oversized.png", Buffer.alloc(MAX_IMAGE_UPLOAD_BYTES + 1)]]) {
    const path = join(home, name)
    await writeFile(path, bytes)
    await assert.rejects(readImageFile(path))
  }
})
