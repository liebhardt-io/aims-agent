/**
 * Shared types for the AIMS (AI Media Studio) public API.
 *
 * Mirrors the contract of:
 *   POST /api/v1/images/generate
 *   POST /api/v1/videos/generate
 *   GET  /api/v1/images/generate   (account/health + image model discovery)
 *   GET  /api/v1/videos/generate   (account/health + video model discovery)
 *   GET  /api/v1/models            (combined model discovery)
 */

export type ApiKeyScope =
  | "image:generate"
  | "video:generate"
  | "media:read"
  | "media:write"

export interface AimsClientOptions {
  /** AIMS API key (starts with `aims_`). */
  apiKey: string
  /** API base URL. Defaults to https://app.ai-media-studio.com/api/v1 */
  baseUrl?: string
  /** Per-request timeout in ms. Generation can take minutes. Default 600000. */
  timeoutMs?: number
  /** Custom fetch implementation (defaults to global fetch). */
  fetch?: typeof fetch
}

export interface ImageGenerateParams {
  /** Required text description of the image. */
  prompt: string
  /** Model id. Defaults server-side. Use `fal-ai/nano-banana-2` for a cheap, fast default. */
  model?: string
  /** Number of images to generate (1-8). Default 1. */
  n?: number
  /** Pixel size for OpenAI models, e.g. "1024x1024", "1536x1024". */
  size?: string
  /** Aspect ratio (Fal models): auto, 21:9, 16:9, 3:2, 4:3, 5:4, 1:1, 4:5, 3:4, 2:3, 9:16. Takes precedence over size. */
  aspect_ratio?: string
  /** Output resolution (model dependent): 0.5K, 1K, 2K, 4K. */
  resolution?: string
  /** Output format. Default png. */
  output_format?: "png" | "jpeg" | "webp"
  /** Image quality (model dependent): low, medium, high, auto, standard, hd. */
  quality?: string
  /** Background (OpenAI/GPT image): auto, transparent, opaque. */
  background?: string
  /** Seed for deterministic output. */
  seed?: number | string
  /** Safety tolerance level "1" (strictest) to "6" (least strict). */
  safety_tolerance?: string
  /** Style preset slug, e.g. "anime-style". */
  style_slug?: string
  /** Reference image URLs (http/https) for image-to-image editing. Max 10. */
  image_urls?: string[]
  /** Allow model web search for the current generation (model dependent). */
  enable_web_search?: boolean
  /** Limit each prompt round to a single generation (Nano Banana models). */
  limit_generations?: boolean
  /** Return media inline (model dependent). */
  sync_mode?: boolean
  /** Make the generated image publicly shareable; response includes share_url. */
  make_public?: boolean
}

export interface GeneratedImage {
  id: string
  url: string | null
  share_url?: string
  status: "completed" | "failed" | string
  error?: string
  credits_refunded?: number
}

export interface ImageGenerateResult {
  success: boolean
  images: GeneratedImage[]
  credits_used: number
  credits_remaining: number
  style_applied?: string
}

export interface VideoGenerateParams {
  /** Required text description of the video. */
  prompt: string
  /** Model id. Defaults to fal-ai/veo3.1/fast server-side. */
  model?: string
  /** Requested duration in seconds. Snaps to the model's nearest supported value. */
  duration?: number | string
  /** Output aspect ratio, e.g. 16:9 or 9:16. */
  aspect_ratio?: string
  /** Enable audio generation when supported by the model. */
  audio?: boolean
  /** Single source image URL for image-to-video models. */
  image_url?: string
  /** Reference image URLs for reference-to-video models. */
  image_urls?: string[]
  /** Start frame for first-last-frame video models. */
  first_frame_url?: string
  /** End frame for first-last-frame video models. */
  last_frame_url?: string
  /** Source video URL for extend-video models. */
  extend_video_url?: string
  /** Classifier-free guidance scale (model dependent). */
  cfg_scale?: number
  /** Negative prompt (model dependent). */
  negative_prompt?: string
  /** Resolution (model dependent). */
  resolution?: string
  /** Provider prompt enhancement (model dependent). */
  enhance_prompt?: boolean
  /** Provider auto-fix (model dependent). */
  auto_fix?: boolean
  /** Seed for deterministic output (model dependent). */
  seed?: number | string
  /** Safety tolerance level "1" to "6". */
  safety_tolerance?: string
  /** Make the generated video publicly shareable; response includes share_url. */
  make_public?: boolean
}

export interface GeneratedVideo {
  id: string
  url: string
  share_url?: string
  status: "completed" | "failed" | string
  model: string
  duration: number
  aspect_ratio: string
  audio: boolean
  credits_refunded?: number
  error?: string
}

export interface VideoGenerateResult {
  success: boolean
  video: GeneratedVideo
  credits_used: number
  credits_remaining: number
}

export interface ModelInfo {
  /** Model id to pass as `model`. */
  id: string
  /** Human-readable label. */
  name: string
  /** Model type, e.g. text2img, img2img, text2video, img2video. */
  model_type: string
  /** Credit cost (per image for image models, per second for video models). */
  credit_cost: number
  description?: string | null
  default_advanced_settings?: Record<string, unknown> | null
  available_settings?: Record<string, unknown> | null
}

export interface AccountStatus {
  status: string
  workspace_id: string
  credits_available: number
  scopes: ApiKeyScope[]
  available_models: ModelInfo[]
}

export interface ModelsResult {
  status: string
  workspace_id: string
  image_models: ModelInfo[]
  video_models: ModelInfo[]
}
