import type {
  AccountStatus,
  AimsClientOptions,
  ImageGenerateParams,
  ImageGenerateResult,
  ModelsResult,
  VideoGenerateParams,
  VideoGenerateResult,
} from "./types.js"
import { resolveBaseUrl } from "./config.js"

/** Error thrown when the AIMS API returns a non-2xx response or the request fails. */
export class AimsApiError extends Error {
  status: number
  body: unknown
  constructor(message: string, status: number, body?: unknown) {
    super(message)
    this.name = "AimsApiError"
    this.status = status
    this.body = body
  }
}

const DEFAULT_TIMEOUT_MS = 600_000

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

    let res: Response
    try {
      res = await this.fetchImpl(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      })
    } catch (err) {
      if ((err as Error)?.name === "AbortError") {
        throw new AimsApiError(`Request timed out after ${this.timeoutMs} ms`, 408)
      }
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

    const text = await res.text()
    let json: any
    try {
      json = text ? JSON.parse(text) : {}
    } catch {
      json = { raw: text }
    }

    if (!res.ok) {
      const message =
        json?.error || json?.message || `Request failed with status ${res.status}`
      throw new AimsApiError(message, res.status, json)
    }
    return json as T
  }

  /** Generate one or more images. Provide `image_urls` for image-to-image editing. */
  generateImage(params: ImageGenerateParams): Promise<ImageGenerateResult> {
    if (!params.prompt?.trim()) throw new Error("`prompt` is required")
    return this.request<ImageGenerateResult>("POST", "/images/generate", params)
  }

  /** Generate a video from a prompt (and optional source image(s)). */
  generateVideo(params: VideoGenerateParams): Promise<VideoGenerateResult> {
    if (!params.prompt?.trim()) throw new Error("`prompt` is required")
    return this.request<VideoGenerateResult>("POST", "/videos/generate", params)
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
