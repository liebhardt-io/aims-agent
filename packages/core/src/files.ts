import { readFile, stat } from "node:fs/promises"
import { basename, extname } from "node:path"

export const MAX_IMAGE_UPLOAD_BYTES = 20 * 1024 * 1024

const IMAGE_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".heic": "image/heic",
  ".bmp": "image/bmp",
}

export async function readImageFile(path: string): Promise<{ file: Blob; filename: string }> {
  const info = await stat(path)
  if (!info.isFile()) throw new Error(`Source image is not a regular file: ${path}`)
  if (info.size === 0 || info.size > MAX_IMAGE_UPLOAD_BYTES) {
    throw new Error("Source image must be non-empty and no larger than 20 MiB")
  }
  const contents = await readFile(path)
  return {
    file: new Blob([contents], { type: IMAGE_TYPES[extname(path).toLowerCase()] || "application/octet-stream" }),
    filename: basename(path),
  }
}
