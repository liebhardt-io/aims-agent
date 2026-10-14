import { createWriteStream } from "node:fs"
import { mkdir, rename, rm, stat } from "node:fs/promises"
import { dirname, extname, join, sep } from "node:path"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import type { ReadableStream } from "node:stream/web"
import { InvalidArgumentError } from "commander"

/** Collect repeatable CLI options into an array. */
export function collect(value: string, previous: string[]): string[] {
  return previous.concat([value])
}

/** Parse an integer option, throwing a friendly error on bad input. */
export function parseIntOption(value: string): number {
  const n = Number(value)
  if (!/^-?\d+$/.test(value) || !Number.isSafeInteger(n)) {
    throw new InvalidArgumentError(`Expected an integer but got "${value}"`)
  }
  return n
}

/** Derive a reasonable filename for a downloaded asset. */
export function deriveFilename(url: string, index: number, fallbackExt: string): string {
  try {
    const u = new URL(url)
    const base = u.pathname.split("/").filter(Boolean).pop() || ""
    if (base && extname(base)) return `${String(index).padStart(2, "0")}-${base}`
  } catch {
    /* ignore */
  }
  return `${String(index).padStart(2, "0")}-output${fallbackExt}`
}

const DOWNLOAD_TIMEOUT_MS = 600_000

/**
 * Stream a URL to a local path (creating parent directories). The deadline covers
 * the whole body, and a partial file never replaces the destination.
 */
export async function downloadTo(url: string, filePath: string, timeoutMs = DOWNLOAD_TIMEOUT_MS): Promise<void> {
  const signal = AbortSignal.timeout(timeoutMs)
  const res = await fetch(url, { signal }).catch((error) => {
    throw signal.aborted ? new Error(`Download timed out after ${timeoutMs} ms`) : error
  })
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download ${url} (HTTP ${res.status})`)
  }
  await mkdir(dirname(filePath), { recursive: true })
  const partial = `${filePath}.${process.pid}.part`
  try {
    await pipeline(Readable.fromWeb(res.body as ReadableStream), createWriteStream(partial))
    await rename(partial, filePath)
  } catch (error) {
    await rm(partial, { force: true })
    throw signal.aborted ? new Error(`Download timed out after ${timeoutMs} ms`) : error
  }
}

/**
 * Resolve where to write a downloaded asset given the --output value.
 * If output looks like a directory (no extension), the derived filename is appended.
 */
export async function resolveOutputPath(
  output: string,
  url: string,
  index: number,
  fallbackExt: string,
  multiple: boolean,
): Promise<string> {
  const existing = await stat(output).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined
    throw error
  })
  const looksLikeDir = existing
    ? existing.isDirectory()
    : !extname(output) || output.endsWith(sep) || output.endsWith("/") || multiple
  if (multiple && existing && !existing.isDirectory()) {
    throw new Error(`Multiple results require an output directory: ${output}`)
  }
  if (looksLikeDir) {
    return join(output, deriveFilename(url, index, fallbackExt))
  }
  return output
}
