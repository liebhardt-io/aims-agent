import { constants } from "node:fs"
import { open, realpath } from "node:fs/promises"
import { basename } from "node:path"

export const MAX_IMAGE_UPLOAD_BYTES = 20 * 1024 * 1024
export const MAX_IMAGE_BASE64_LENGTH = 4 * Math.ceil(MAX_IMAGE_UPLOAD_BYTES / 3)

function imageMime(bytes: Buffer): string | undefined {
  if (bytes.length < 12) return undefined
  const starts = (signature: number[]) => bytes.subarray(0, signature.length).equals(Buffer.from(signature))
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png"
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg"
  const ascii = (start: number, end: number) => bytes.toString("ascii", start, end)
  if (["GIF87a", "GIF89a"].includes(ascii(0, 6))) return "image/gif"
  if (ascii(0, 2) === "BM") return "image/bmp"
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp"
  if (ascii(4, 8) === "ftyp" && bytes.length >= 16) {
    const boxSize = bytes.readUInt32BE(0)
    if (boxSize < 16 || boxSize > bytes.length) return undefined
    const heifBrands = new Set(["heic", "heix", "hevc", "hevx", "heif", "mif1", "msf1"])
    let heif = false
    for (let offset = 8; offset + 4 <= boxSize; offset += offset === 8 ? 8 : 4) {
      const brand = ascii(offset, offset + 4)
      if (brand === "avif" || brand === "avis") return "image/avif"
      heif ||= heifBrands.has(brand)
    }
    if (heif) return "image/heic"
  }
  return undefined
}

function checkedImage(bytes: Buffer): Blob {
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_UPLOAD_BYTES) {
    throw new Error("Source image must be non-empty and no larger than 20 MiB")
  }
  const mime = imageMime(bytes)
  if (!mime) throw new Error("Source file must be a raster image. SVG and non-image files are not supported.")
  return new Blob([bytes], { type: mime })
}

/** Decode caller-supplied image contents without accessing the filesystem. */
export function imageBlobFromBase64(value: string): Blob {
  if (!value || value.length > MAX_IMAGE_BASE64_LENGTH || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw new Error("Supply raw base64 image contents, up to 20 MiB, without a data URL prefix")
  }
  const bytes = Buffer.from(value, "base64")
  if (bytes.toString("base64") !== value) throw new Error("Invalid base64 image contents")
  return checkedImage(bytes)
}

/** CLI file selection is explicit; MCP uploads use supplied contents instead. */
export async function readImageFile(path: string): Promise<{ file: Blob; filename: string }> {
  const canonical = await realpath(path)
  const handle = await open(canonical, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const info = await handle.stat()
    if (!info.isFile()) throw new Error("Source image must be a regular file")
    if (info.size === 0 || info.size > MAX_IMAGE_UPLOAD_BYTES) {
      throw new Error("Source image must be non-empty and no larger than 20 MiB")
    }
    const chunks: Buffer[] = []
    let size = 0
    while (true) {
      const chunk = Buffer.alloc(Math.min(256 * 1024, MAX_IMAGE_UPLOAD_BYTES - size + 1))
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, null)
      if (bytesRead === 0) break
      size += bytesRead
      if (size > MAX_IMAGE_UPLOAD_BYTES) throw new Error("Source image exceeds the 20 MiB limit")
      chunks.push(chunk.subarray(0, bytesRead))
    }
    return { file: checkedImage(Buffer.concat(chunks, size)), filename: basename(path) }
  } finally {
    await handle.close()
  }
}
