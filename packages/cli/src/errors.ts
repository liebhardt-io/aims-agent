import {
  AimsApiError,
  apiErrorHint,
  missingApiKeyMessage,
} from "@ai-media-studio/core"

export const USAGE_EXIT = 2
export const ERROR_EXIT = 1

export function die(message: string, code = ERROR_EXIT): never {
  process.stderr.write(`${message}\n`)
  process.exit(code)
}

export function usage(message: string): never {
  die(message, USAGE_EXIT)
}

export function handleError(err: unknown): never {
  if (err instanceof AimsApiError) {
    const hint = apiErrorHint(err.status)
    const suffix = hint ? `\n${hint}` : ""
    die(`AIMS API error (${err.status}): ${err.message}${suffix}`)
  }
  die(`Error: ${(err as Error)?.message ?? String(err)}`)
}

export function requireApiKey(key: string | undefined): string {
  if (!key) die(missingApiKeyMessage(), USAGE_EXIT)
  return key
}
