import type {
  AccountStatus,
  AimsClientOptions,
  ImageGenerateParams,
  ImageGenerateResult,
  ImageUploadResult,
  MediaStatusResult,
  ModelsResult,
  VideoGenerateParams,
  VideoGenerateResult,
} from "./types.js"
import { assertSecureBaseUrl, resolveBaseUrl } from "./config.js"
import { MAX_IMAGE_UPLOAD_BYTES } from "./files.js"

/**
 * Error thrown when the AIMS API returns a non-2xx response or the request fails.
 * `status` is 0 when no HTTP response arrived (network failure or timeout).
 */
export class AimsApiError extends Error {
  status: number
  body: unknown
  /** Machine-readable reason from the response body, such as PAID_PLAN_REQUIRED, or CLIENT_TIMEOUT. */
  code?: string
  constructor(message: string, status: number, body?: unknown, code?: string) {
    super(message)
    this.name = "AimsApiError"
    this.status = status
    this.body = body
    const bodyCode = body && typeof body === "object" ? (body as Record<string, unknown>).code : undefined
    this.code = code ?? (typeof bodyCode === "string" ? bodyCode : undefined)
  }

  /** The server accepted the generation and it is still running; it is charged if it completes. */
  get stillGenerating(): boolean {
    return Boolean(this.body && typeof this.body === "object" && (this.body as Record<string, unknown>).status === "generating")
  }
}

// Generation routes may run for up to 600 s on the server; wait a little longer
// so a slow but successful generation is not abandoned (and paid for twice).
const DEFAULT_TIMEOUT_MS = 660_000

function errorMessageFromBody(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>
    if (typeof record.error === "string" && record.error) return record.error
    if (typeof record.message === "string" && record.message) return record.message
  }
  return `Request failed with status ${status}`
}

/**
 * Minimal, dependency-free client for the AIMS public API.
 * Works in Node 18+ (global fetch) and any environment with a fetch implementation.
 */
export class AimsClient {
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly fetchImpl: typeof fetch

  constructor(options: AimsClientOptions) {
    if (!options.apiKey) {
      throw new Error(
        "An AIMS API key is required. Pass `apiKey` or set the AIMS_API_KEY environment variable.",
      )
    }
    this.apiKey = options.apiKey
    this.baseUrl = resolveBaseUrl(options.baseUrl)
    assertSecureBaseUrl(this.baseUrl)
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    const f = options.fetch ?? globalThis.fetch
    if (!f) {
      throw new Error(
        "global fetch is not available. Use Node.js 18+ or pass a `fetch` implementation.",
      )
    }
    this.fetchImpl = f
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
    const multipart = body instanceof FormData

    try {
      const res = await this.fetchImpl(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          ...(multipart ? {} : { "Content-Type": "application/json" }),
          Accept: "application/json",
        },
        body: multipart ? body : body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      })
      const text = await res.text()
      let json: unknown
      try {
        json = text ? JSON.parse(text) : {}
      } catch {
        json = { raw: text }
      }

      if (!res.ok) {
        const message = errorMessageFromBody(json, res.status)
        throw new AimsApiError(message, res.status, json)
      }
      return json as T
    } catch (err) {
      if (controller.signal.aborted) {
        throw new AimsApiError(
          `No response within ${Math.round(this.timeoutMs / 1000)} s. A generation may still complete and be charged.`,
          0,
          undefined,
          "CLIENT_TIMEOUT",
        )
      }
      if (err instanceof AimsApiError) throw err
      // Report only the path (not the host) to avoid leaking infra topology
      // hints from a custom AIMS_BASE_URL into error output/logs.
      const safePath = (() => {
        try {
          return new URL(url).pathname
        } catch {
          return "the API"
        }
      })()
      throw new AimsApiError(
        `Network error calling ${safePath}: ${(err as Error)?.message ?? String(err)}`,
        0,
      )
    } finally {
      clearTimeout(timeout)
    }
  }

  /** Generate one or more images. Provide `image_urls` for image-to-image editing. */
  generateImage(params: ImageGenerateParams): Promise<ImageGenerateResult> {
    if (!params.prompt?.trim()) throw new Error("`prompt` is required")
    return this.request<ImageGenerateResult>("POST", "/images/generate", params)
  }

  /** Upload a source image to this workspace. Requires the media:write scope. */
  uploadImage(file: Blob, filename = "image"): Promise<ImageUploadResult> {
    if (file.size === 0 || file.size > MAX_IMAGE_UPLOAD_BYTES) {
      throw new Error("Source image must be non-empty and no larger than 20 MiB")
    }
    const body = new FormData()
    body.append("file", file, filename)
    return this.request<ImageUploadResult>("POST", "/uploads", body)
  }

  /** Generate a video from a prompt (and optional source image(s)). */
  generateVideo(params: VideoGenerateParams): Promise<VideoGenerateResult> {
    if (!params.prompt?.trim()) throw new Error("`prompt` is required")
    return this.request<VideoGenerateResult>("POST", "/videos/generate", params)
  }

  /** Status and URL of one generation in this workspace. Requires the media:read scope. */
  getMedia(id: string): Promise<MediaStatusResult> {
    if (!id?.trim()) throw new Error("`id` is required")
    return this.request<MediaStatusResult>("GET", `/media/${encodeURIComponent(id.trim())}`)
  }

  /** Revoke the API key this client authenticates with. */
  revokeCurrentKey(): Promise<{ success: boolean; revoked: boolean }> {
    return this.request("DELETE", "/keys/current")
  }

  /** Account status: workspace id, available credits, scopes, and available image models. */
  account(): Promise<AccountStatus> {
    return this.request<AccountStatus>("GET", "/images/generate")
  }

  /**
   * List available models. Uses GET /models when available and transparently falls
   * back to the per-route discovery endpoints for older deployments.
   */
  async listModels(type?: "image" | "video"): Promise<ModelsResult> {
    try {
      const q = type ? `?type=${type}` : ""
      return await this.request<ModelsResult>("GET", `/models${q}`)
    } catch (err) {
      if (err instanceof AimsApiError && err.status === 404) {
        // Fallback for deployments without GET /models. The per-route discovery
        // endpoints each return AccountStatus whose `available_models` is already
        // filtered server-side: GET /images/generate → image models only,
        // GET /videos/generate → video models only (see reference/api.md).
        const wantImages = type !== "video"
        const wantVideos = type !== "image"
        const [img, vid] = await Promise.all([
          wantImages
            ? this.request<AccountStatus>("GET", "/images/generate")
            : Promise.resolve(null),
          wantVideos
            ? this.request<AccountStatus>("GET", "/videos/generate")
            : Promise.resolve(null),
        ])
        return {
          status: "ok",
          workspace_id: img?.workspace_id || vid?.workspace_id || "",
          image_models: img?.available_models ?? [],
          video_models: vid?.available_models ?? [],
        }
      }
      throw err
    }
  }
}
