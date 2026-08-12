import { z } from "zod"
import {
  AimsApiError,
  AimsClient,
  apiErrorHint,
  missingApiKeyMessage,
  resolveApiKey,
  resolveBaseUrl,
  type ImageGenerateResult,
  type VideoGenerateResult,
} from "@ai-media-studio/core"

export const PACKAGE_VERSION = "0.2.0"

export function getClient(): AimsClient {
  const apiKey = resolveApiKey()
  if (!apiKey) {
    throw new Error(
      missingApiKeyMessage() +
        "\n  claude mcp add aims -e AIMS_API_KEY=aims_xxx -- npx -y -p @ai-media-studio/mcp@latest aims-mcp",
    )
  }
  return new AimsClient({ apiKey, baseUrl: resolveBaseUrl() })
}

export type ToolResult = {
  content: Array<{ type: "text"; text: string }>
  structuredContent?: Record<string, unknown>
  isError?: boolean
}

export function ok(data: Record<string, unknown>): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
  }
}

export function fail(err: unknown): ToolResult {
  let status: number | undefined
  let message: string
  if (err instanceof AimsApiError) {
    status = err.status
    message =
      err.status >= 500
        ? "the service failed to process the request. Please try again."
        : err.message
  } else {
    message = (err as Error)?.message ?? String(err)
  }
  const hint = status !== undefined ? apiErrorHint(status) : ""
  const payload = {
    success: false,
    error: status !== undefined ? `AIMS API error (${status}): ${message}` : `Error: ${message}`,
    hint: hint || undefined,
    next:
      status === 401
        ? ["aims login --key <aims_key>", "export AIMS_API_KEY=<aims_key>"]
        : status === 402
          ? ["aims whoami --json"]
          : undefined,
  }
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    isError: true,
  }
}

export const SERVER_INSTRUCTIONS = `AI Media Studio (AIMS) generates images and videos. Authenticate with AIMS_API_KEY (or ~/.aims/config.json from \`aims login --key\`).

Workflow:
1. Call get_account if you need the credit balance or scopes.
2. Call list_models to pick a live model id when the user did not specify one.
3. Call generate_image, edit_image, or generate_video. Each call spends workspace credits.
4. Return the hosted url(s), credits_used, and credits_remaining to the user.

Defaults:
- Image: fal-ai/nano-banana-2 (cheap/fast). Use openai/gpt-image-2 for crisp text.
- Video: fal-ai/veo3.1/fast. Video credits are per second — keep clips short.
- Image-to-video requires a model id ending in /image-to-video plus image_url.

All tools return JSON (url, id, credits). Do not invent model ids; use list_models.`

const generatedImageSchema = z.object({
  id: z.string(),
  url: z.string().nullable(),
  share_url: z.string().optional(),
  status: z.string(),
  error: z.string().optional(),
})

export const imageOutputSchema = z
  .object({
    success: z.boolean(),
    images: z.array(generatedImageSchema),
    credits_used: z.number(),
    credits_remaining: z.number(),
    style_applied: z.string().optional(),
  })
  .passthrough()

export const videoOutputSchema = z
  .object({
    success: z.boolean(),
    video: z
      .object({
        id: z.string(),
        url: z.string(),
        share_url: z.string().optional(),
        status: z.string(),
        model: z.string(),
        duration: z.number(),
        aspect_ratio: z.string(),
        audio: z.boolean(),
        error: z.string().optional(),
      })
      .passthrough(),
    credits_used: z.number(),
    credits_remaining: z.number(),
  })
  .passthrough()

const modelInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  model_type: z.string(),
  credit_cost: z.number(),
  description: z.string().nullable().optional(),
})

export const modelsOutputSchema = z
  .object({
    status: z.string(),
    workspace_id: z.string(),
    image_models: z.array(modelInfoSchema),
    video_models: z.array(modelInfoSchema),
  })
  .passthrough()

export const accountOutputSchema = z
  .object({
    status: z.string(),
    workspace_id: z.string(),
    credits_available: z.number(),
    scopes: z.array(z.string()),
    available_models: z.array(modelInfoSchema),
  })
  .passthrough()

export function imageResult(result: ImageGenerateResult): ToolResult {
  return ok({ ...result })
}

export function videoResult(result: VideoGenerateResult): ToolResult {
  return ok({ ...result })
}

export const TOOL_CATALOG = [
  {
    name: "generate_image",
    description:
      "Generate one or more images from a text prompt. Returns JSON with hosted image URL(s), ids, and credit usage. Provide image_urls for image-to-image. Spends workspace credits.",
  },
  {
    name: "edit_image",
    description:
      "Transform existing image(s) with a text instruction. Requires image_urls (http/https). Returns JSON with the edited image URL(s) and credit usage.",
  },
  {
    name: "generate_video",
    description:
      "Generate a video from a text prompt. Supports image-to-video via image_url. Returns JSON with the hosted MP4 URL and credit usage. Credits are per second; can take a few minutes.",
  },
  {
    name: "list_models",
    description:
      "List live image and video model ids and credit costs. Use a returned id as the model argument. Read-only.",
  },
  {
    name: "get_account",
    description:
      "Show workspace id, credit balance, and API key scopes. Read-only. Call this before expensive video jobs.",
  },
] as const
