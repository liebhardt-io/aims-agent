import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import { imageBlobFromBase64, MAX_IMAGE_BASE64_LENGTH, resolveMaxCredits, type ImageGenerateParams, type VideoGenerateParams } from "@ai-media-studio/core"
import {
  PACKAGE_VERSION,
  SERVER_INSTRUCTIONS,
  accountOutputSchema,
  fail,
  getClient,
  imageOutputSchema,
  imageResult,
  mediaOutputSchema,
  modelsOutputSchema,
  ok,
  videoOutputSchema,
  videoResult,
} from "./format.js"

type ToolExtra = {
  _meta?: { progressToken?: string | number }
  sendNotification: (notification: { method: "notifications/progress"; params: { progressToken: string | number; progress: number; message?: string } }) => Promise<void>
}

const PROGRESS_INTERVAL_MS = 15_000

/**
 * Generations take minutes. When the client asks for progress, report elapsed
 * seconds right away and then every 15 s, so clients that reset their request
 * timeout on progress do not give up on a generation that is still being paid for.
 */
async function withProgress<T>(extra: ToolExtra, label: string, work: () => Promise<T>): Promise<T> {
  const token = extra._meta?.progressToken
  if (token === undefined) return work()
  const started = Date.now()
  const report = () => {
    const seconds = Math.round((Date.now() - started) / 1000)
    extra
      .sendNotification({ method: "notifications/progress", params: { progressToken: token, progress: seconds, message: `${label} (${seconds} s)` } })
      .catch(() => {})
  }
  report()
  const timer = setInterval(report, PROGRESS_INTERVAL_MS)
  try {
    return await work()
  } finally {
    clearInterval(timer)
  }
}

const maxCredits = z
  .number()
  .positive()
  .optional()
  .describe("Refuse the call, charging nothing, if it would cost more credits than this. Defaults to AIMS_MAX_CREDITS when set.")

function withMaxCredits<T extends { max_credits?: number }>(args: T): T {
  return { ...args, max_credits: args.max_credits ?? resolveMaxCredits() }
}

export function createAimsServer(): McpServer {
  const server = new McpServer(
    { name: "aims", version: PACKAGE_VERSION },
    { instructions: SERVER_INSTRUCTIONS },
  )

  server.registerTool(
    "upload_image",
    {
      title: "Upload source image",
      description:
        "Upload supplied base64 image contents to the API key's workspace before editing or image-to-video. " +
        "Requires media:write. Accepts raster images up to 20 MiB and never reads local paths. " +
        "For local files use aims upload, then pass its returned URL. Returns the workspace-hosted URL.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: {
        image_base64: z.string().min(1).max(MAX_IMAGE_BASE64_LENGTH).describe("Raw base64 raster-image contents without a data URL prefix. Filesystem paths are not accepted."),
        filename: z.string().min(1).max(255).optional().describe("Optional upload filename, used only as a label."),
      },
      outputSchema: z.object({ success: z.boolean(), id: z.string(), url: z.string() }),
    },
    async ({ image_base64, filename }) => {
      try {
        const client = getClient()
        const file = imageBlobFromBase64(image_base64)
        return ok({ ...await client.uploadImage(file, filename ?? "image") })
      } catch (error) {
        return fail(error)
      }
    },
  )

  server.registerTool(
    "generate_image",
    {
      title: "Generate image",
      description:
        "Generate one or more images from a text prompt using AI Media Studio (AIMS). " +
        "Returns JSON with hosted image URL(s). Provide image_urls for image-to-image editing. " +
        "Each generation spends workspace credits. Default model: fal-ai/nano-banana-pro.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: {
        prompt: z.string().min(1).describe("Text description of the image to generate."),
        model: z
          .string()
          .optional()
          .describe(
            "Model id. Default 'fal-ai/nano-banana-pro'. Use list_models to discover live ids.",
          ),
        n: z.number().int().min(1).max(8).optional().describe("Number of images (1-8). Default 1."),
        aspect_ratio: z
          .string()
          .optional()
          .describe("auto, 21:9, 16:9, 3:2, 4:3, 5:4, 1:1, 4:5, 3:4, 2:3, or 9:16."),
        resolution: z.string().optional().describe("0.5K, 1K, 2K, or 4K (model dependent)."),
        size: z.string().optional().describe("Pixel size like 1024x1024 (OpenAI models)."),
        output_format: z.enum(["png", "jpeg", "webp"]).optional().describe("Default png."),
        quality: z.string().optional().describe("low, medium, high, auto (model dependent)."),
        style_slug: z.string().optional().describe("Optional style preset slug, e.g. 'anime-style'."),
        image_urls: z
          .array(z.string().url())
          .max(10)
          .optional()
          .describe("Workspace-hosted reference image URLs for editing. Max 10. Upload local files with upload_image first."),
        seed: z.union([z.number(), z.string()]).optional().describe("Seed for deterministic output."),
        safety_tolerance: z.enum(["1", "2", "3", "4", "5", "6"]).optional().describe("Moderation strictness for Nano Banana models: 1 (strictest) to 6."),
        enable_web_search: z.boolean().optional().describe("Let Nano Banana models search the web for this prompt (costs extra credits)."),
        limit_generations: z
          .boolean()
          .optional()
          .describe("Limit each prompt round to a single generation (Nano Banana models)."),
        make_public: z
          .boolean()
          .optional()
          .describe("Make the result publicly shareable; returns a share_url."),
        max_credits: maxCredits,
      },
      outputSchema: imageOutputSchema,
    },
    async (args, extra) => {
      try {
        const client = getClient()
        const result = await withProgress(extra, "Generating image(s)", () => client.generateImage(withMaxCredits(args) as ImageGenerateParams))
        return imageResult(result)
      } catch (err) {
        return fail(err)
      }
    },
  )

  server.registerTool(
    "edit_image",
    {
      title: "Edit image (image-to-image)",
      description:
        "Transform or edit existing image(s) with a text instruction using AI Media Studio (AIMS). " +
        "Provide workspace-hosted source image URLs; upload local files with upload_image first. Returns JSON with the edited image URL.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: {
        prompt: z.string().min(1).describe("Instruction describing the edit/transformation."),
        image_urls: z
          .array(z.string().url())
          .min(1)
          .max(10)
          .describe("Workspace-hosted source image URLs to edit. 1-10."),
        model: z.string().optional().describe("Model id. Defaults to an edit-capable model."),
        n: z.number().int().min(1).max(8).optional().describe("Number of edited variations (1-8). Default 1."),
        aspect_ratio: z.string().optional().describe("Defaults to 'auto' to preserve the source proportions."),
        resolution: z.string().optional().describe("0.5K, 1K, 2K, or 4K (model dependent)."),
        size: z.string().optional().describe("Pixel size like 1024x1024 (OpenAI models)."),
        output_format: z.enum(["png", "jpeg", "webp"]).optional(),
        quality: z.string().optional().describe("low, medium, high, auto (model dependent)."),
        style_slug: z.string().optional().describe("Optional style preset slug, e.g. 'anime-style'."),
        seed: z.union([z.number(), z.string()]).optional().describe("Seed for deterministic output."),
        safety_tolerance: z.enum(["1", "2", "3", "4", "5", "6"]).optional().describe("Moderation strictness for Nano Banana models: 1 (strictest) to 6."),
        make_public: z.boolean().optional(),
        max_credits: maxCredits,
      },
      outputSchema: imageOutputSchema,
    },
    async (args, extra) => {
      try {
        const client = getClient()
        const params = withMaxCredits({ ...args, aspect_ratio: args.aspect_ratio ?? "auto" })
        const result = await withProgress(extra, "Editing image(s)", () => client.generateImage(params as ImageGenerateParams))
        return imageResult(result)
      } catch (err) {
        return fail(err)
      }
    },
  )

  server.registerTool(
    "generate_video",
    {
      title: "Generate video",
      description:
        "Generate a video from a text prompt using AI Media Studio (AIMS). " +
        "Supports image-to-video (image_url), reference-to-video (image_urls), " +
        "and start and end frames (image_url and last_frame_url). " +
        "Returns JSON with the hosted MP4 URL. Credits are per second; keep clips short.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: {
        prompt: z.string().min(1).describe("Text description of the video to generate."),
        model: z
          .string()
          .optional()
          .describe(
            "Model id. Default 'fal-ai/kling-video/o3/pro/text-to-video'. For image-to-video use an id ending in /image-to-video. Use list_models to discover.",
          ),
        duration: z
          .union([z.number(), z.string()])
          .optional()
          .describe("Requested duration in seconds; snaps to the model's nearest supported value."),
        aspect_ratio: z.string().optional().describe("e.g. 16:9 or 9:16."),
        audio: z.boolean().optional().describe("Enable audio when the model supports it. Kling 4.0 and Grok Imagine clips always have sound."),
        image_url: z.string().url().optional().describe("Workspace-hosted source image for image-to-video. Upload local files with upload_image first."),
        image_urls: z
          .array(z.string().url())
          .optional()
          .describe("Reference images for reference-to-video models."),
        first_frame_url: z.string().url().optional().describe("Start frame for Kling and FLUX 3 Max image-to-video models; image_url works on every image-to-video model."),
        last_frame_url: z.string().url().optional().describe("End frame, with image_url, on Kling, Seedance 2.0 and FLUX 3 Max image-to-video models."),
        extend_video_url: z.string().url().optional().describe("Source video URL for extend-video models."),
        resolution: z.string().optional().describe("Resolution when supported (e.g. 720p, 1080p)."),
        negative_prompt: z.string().optional().describe("Negative prompt when supported."),
        seed: z.union([z.number(), z.string()]).optional().describe("Seed for deterministic output when supported."),
        make_public: z.boolean().optional().describe("Make the result publicly shareable."),
        max_credits: maxCredits,
      },
      outputSchema: videoOutputSchema,
    },
    async (args, extra) => {
      try {
        const client = getClient()
        const result = await withProgress(extra, "Generating video", () => client.generateVideo(withMaxCredits(args) as VideoGenerateParams))
        return videoResult(result)
      } catch (err) {
        return fail(err)
      }
    },
  )

  server.registerTool(
    "get_media",
    {
      title: "Get media status",
      description:
        "Read one generation's status and URL by id. Use it for an image or video that returned status \"generating\" " +
        "(or an error with media_id) instead of generating again. Read-only; requires media:read.",
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        id: z.string().uuid().describe("Image or video id from generate_image, edit_image or generate_video, or media_id from an error."),
      },
      outputSchema: mediaOutputSchema,
    },
    async ({ id }) => {
      try {
        const result = await getClient().getMedia(id)
        return ok({ ...result })
      } catch (err) {
        return fail(err)
      }
    },
  )

  server.registerTool(
    "list_models",
    {
      title: "List models",
      description:
        "List the image and video models currently available in AI Media Studio (AIMS), " +
        "with their ids and credit costs. Use the returned id as the `model` argument. Read-only.",
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {
        type: z
          .enum(["image", "video"])
          .optional()
          .describe("Filter by 'image' or 'video'. Omit for both."),
      },
      outputSchema: modelsOutputSchema,
    },
    async (args) => {
      try {
        const result = await getClient().listModels(args.type)
        return ok({ ...result })
      } catch (err) {
        return fail(err)
      }
    },
  )

  server.registerTool(
    "get_account",
    {
      title: "Get account status",
      description:
        "Show the API key's workspace id, available credit balance, and granted scopes. Read-only.",
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: {},
      outputSchema: accountOutputSchema,
    },
    async () => {
      try {
        const status = await getClient().account()
        return ok({ ...status })
      } catch (err) {
        return fail(err)
      }
    },
  )

  return server
}
