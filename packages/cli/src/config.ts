import { homedir } from "node:os"
import { join } from "node:path"
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs"

export interface CliConfig {
  apiKey?: string
  baseUrl?: string
}

const CONFIG_DIR = join(homedir(), ".aims")
const CONFIG_PATH = join(CONFIG_DIR, "config.json")

export function configPath(): string {
  return CONFIG_PATH
}

export function readConfig(): CliConfig {
  try {
    if (!existsSync(CONFIG_PATH)) return {}
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as CliConfig
  } catch {
    return {}
  }
}

export function writeConfig(config: CliConfig): string {
  mkdirSync(CONFIG_DIR, { recursive: true })
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 })
  // Ensure restrictive permissions even if the file already existed.
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

/** Resolve the API key: explicit flag > AIMS_API_KEY env > saved config. */
export function resolveApiKey(flagKey?: string): string | undefined {
  return flagKey || process.env.AIMS_API_KEY || readConfig().apiKey
}

/** Resolve the base URL: explicit flag > AIMS_BASE_URL env > saved config > default. */
export function resolveBaseUrl(flagUrl?: string): string | undefined {
  return flagUrl || process.env.AIMS_BASE_URL || readConfig().baseUrl
}
