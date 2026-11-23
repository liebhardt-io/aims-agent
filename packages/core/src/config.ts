import { homedir } from "node:os"
import { join } from "node:path"
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs"

/** Default production base URL for the AIMS public API. */
export const DEFAULT_BASE_URL = "https://app.ai-media-studio.com/api/v1"

export const API_KEY_HELP =
  "Create an API key in AI Media Studio → Workspace Settings → API Keys."

export const LOGIN_EXAMPLE = "aims login --key <aims_key>"

export interface AimsFileConfig {
  apiKey?: string
  baseUrl?: string
}

const CONFIG_DIR = join(homedir(), ".aims")
const CONFIG_PATH = join(CONFIG_DIR, "config.json")

export function aimsConfigPath(): string {
  return CONFIG_PATH
}

export function readAimsFileConfig(): AimsFileConfig {
  try {
    if (!existsSync(CONFIG_PATH)) return {}
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as AimsFileConfig
  } catch {
    return {}
  }
}

/** Persist CLI config. Replaces the file (omitted keys are cleared). Mode 0600. */
export function writeAimsFileConfig(config: AimsFileConfig): string {
  mkdirSync(CONFIG_DIR, { recursive: true })
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 })
  try {
    chmodSync(CONFIG_PATH, 0o600)
  } catch {
    process.stderr.write(
      `Warning: could not set 0600 permissions on ${CONFIG_PATH}; ` +
        `your API key file may be readable by other users on this system.\n`,
    )
  }
  return CONFIG_PATH
}

/** Resolve the API base URL: explicit > AIMS_BASE_URL (alias AIMS_API_BASE_URL) > saved config > default. */
export function resolveBaseUrl(explicit?: string): string {
  const raw =
    explicit ||
    process.env.AIMS_BASE_URL ||
    process.env.AIMS_API_BASE_URL ||
    readAimsFileConfig().baseUrl ||
    DEFAULT_BASE_URL
  return raw.replace(/\/+$/, "")
}

/**
 * Refuse to send a key in clear text: the base URL must use HTTPS unless it is
 * a loopback address (local development and tests).
 */
export function assertSecureBaseUrl(baseUrl: string): void {
  let url: URL
  try {
    url = new URL(baseUrl)
  } catch {
    throw new Error(`Invalid API base URL: ${baseUrl}`)
  }
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new Error("The API base URL must use https:// (http:// is allowed only for 127.0.0.1, localhost and [::1]).")
  }
}

/** Optional per-call spending cap: explicit > AIMS_MAX_CREDITS. Undefined when unset. */
export function resolveMaxCredits(explicit?: number): number | undefined {
  if (explicit !== undefined) return explicit
  const raw = process.env.AIMS_MAX_CREDITS
  if (!raw) return undefined
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) throw new Error(`AIMS_MAX_CREDITS must be a positive number (got "${raw}")`)
  return value
}

/** Resolve the API key: explicit > AIMS_API_KEY > ~/.aims/config.json. */
export function resolveApiKey(explicit?: string): string | undefined {
  return explicit || process.env.AIMS_API_KEY || readAimsFileConfig().apiKey
}

/** Show only the `aims_` prefix and the last four characters of a saved key. */
export function redactApiKey(key: string): string {
  const prefix = key.startsWith("aims_") ? "aims_" : ""
  return key.length - prefix.length >= 12 ? `${prefix}…${key.slice(-4)}` : `${prefix}…`
}
