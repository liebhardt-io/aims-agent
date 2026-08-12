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

/** Resolve the API base URL: explicit > env > saved config > default. */
export function resolveBaseUrl(explicit?: string): string {
  const raw =
    explicit ||
    process.env.AIMS_BASE_URL ||
    process.env.AIMS_API_BASE_URL ||
    readAimsFileConfig().baseUrl ||
    DEFAULT_BASE_URL
  return raw.replace(/\/+$/, "")
}

/** Resolve the API key: explicit > AIMS_API_KEY > ~/.aims/config.json. */
export function resolveApiKey(explicit?: string): string | undefined {
  return explicit || process.env.AIMS_API_KEY || readAimsFileConfig().apiKey
}
