import { mkdir, writeFile } from "node:fs/promises"
import { dirname, extname, join } from "node:path"

/** Collect repeatable CLI options into an array. */
export function collect(value: string, previous: string[]): string[] {
  return previous.concat([value])
}

/** Parse an integer option, throwing a friendly error on bad input. */
export function parseIntOption(value: string): number {
  const n = Number.parseInt(value, 10)
  if (Number.isNaN(n)) {
    throw new Error(`Expected an integer but got "${value}"`)
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

/** Download a URL to a local path (creating parent directories). */
export async function downloadTo(url: string, filePath: string): Promise<void> {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to download ${url} (HTTP ${res.status})`)
  }
  const buf = Buffer.from(await res.arrayBuffer())
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, buf)
}

/**
 * Resolve where to write a downloaded asset given the --output value.
 * If output looks like a directory (no extension), the derived filename is appended.
 */
export function resolveOutputPath(
  output: string,
  url: string,
  index: number,
  fallbackExt: string,
  multiple: boolean,
): string {
  const looksLikeDir = !extname(output) || multiple
  if (looksLikeDir) {
    return join(output, deriveFilename(url, index, fallbackExt))
  }
  return output
}
