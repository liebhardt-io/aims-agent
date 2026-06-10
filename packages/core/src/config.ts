/** Default production base URL for the AIMS public API. */
export const DEFAULT_BASE_URL = "https://app.ai-media-studio.com/api/v1"

/** Resolve the API base URL from an explicit value, env, or the default. */
export function resolveBaseUrl(explicit?: string): string {
  const raw =
    explicit ||
    process.env.AIMS_BASE_URL ||
    process.env.AIMS_API_BASE_URL ||
    DEFAULT_BASE_URL
  // Trim trailing slashes so path joins are predictable.
  return raw.replace(/\/+$/, "")
}

/** Resolve the API key from an explicit value or the AIMS_API_KEY env var. */
export function resolveApiKey(explicit?: string): string | undefined {
  return explicit || process.env.AIMS_API_KEY || undefined
}
