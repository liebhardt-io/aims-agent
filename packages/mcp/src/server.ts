import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import type { ImageGenerateParams, VideoGenerateParams } from "@ai-media-studio/core"
import {
  PACKAGE_VERSION,
  SERVER_INSTRUCTIONS,
  accountOutputSchema,
  fail,
  getClient,
  imageOutputSchema,
  imageResult,
  modelsOutputSchema,
  ok,
  videoOutputSchema,
  videoResult,
} from "./format.js"

export function createAimsServer(): McpServer {
  const server = new McpServer(
    { name: "aims", version: PACKAGE_VERSION },
    { instructions: SERVER_INSTRUCTIONS },
  )

  server.registerTool(
    "generate_image",
    {
      title: "Generate image",
      description:
        "Generate one or more images from a text prompt using AI Media Studio (AIMS). " +
        "Returns JSON with hosted image URL(s). Provide image_urls for image-to-image editing. " +
        "Each generation spends workspace credits. Default model: fal-ai/nano-banana-2.",
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
            "Model id. Recommended cheap default: 'fal-ai/nano-banana-2'. Use list_models to discover live ids.",
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
          .describe("Reference image URLs (http/https) for image-to-image editing. Max 10."),
        seed: z.union([z.number(), z.string()]).optional().describe("Seed for deterministic output."),
        limit_generations: z
          .boolean()
          .optional()
          .describe("Limit each prompt round to a single generation (Nano Banana models)."),
        make_public: z
          .boolean()
          .optional()
          .describe("Make the result publicly shareable; returns a share_url."),
      },
      outputSchema: imageOutputSchema,
    },
    async (args) => {
      try {
        const result = await getClient().generateImage(args as ImageGenerateParams)
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
        "Provide one or more source image URLs (http/https). Returns JSON with the edited image URL.",
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
          .describe("Source image URLs (http/https) to edit. 1-10."),
        model: z.string().optional().describe("Model id. Defaults to an edit-capable model."),
        aspect_ratio: z.string().optional().describe("Defaults to 'auto' to preserve proportions."),
        resolution: z.string().optional().describe("0.5K, 1K, 2K, or 4K (model dependent)."),
        output_format: z.enum(["png", "jpeg", "webp"]).optional(),
        make_public: z.boolean().optional(),
      },
      outputSchema: imageOutputSchema,
    },
    async (args) => {
      try {
        const result = await getClient().generateImage(args as ImageGenerateParams)
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
        "Supports image-to-video (image_url) and reference-to-video (image_urls). " +
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
            "Model id. Default 'fal-ai/veo3.1/fast'. For image-to-video use an id ending in /image-to-video. Use list_models to discover.",
          ),
        duration: z
          .union([z.number(), z.string()])
          .optional()
          .describe("Requested duration in seconds; snaps to the model's nearest supported value."),
        aspect_ratio: z.string().optional().describe("e.g. 16:9 or 9:16."),
        audio: z.boolean().optional().describe("Enable audio when the model supports it."),
        image_url: z.string().url().optional().describe("Source image for image-to-video models."),
        image_urls: z
          .array(z.string().url())
          .optional()
          .describe("Reference images for reference-to-video models."),
        resolution: z.string().optional().describe("Resolution when supported (e.g. 720p, 1080p)."),
        negative_prompt: z.string().optional().describe("Negative prompt when supported."),
        make_public: z.boolean().optional().describe("Make the result publicly shareable."),
      },
      outputSchema: videoOutputSchema,
    },
    async (args) => {
      try {
        const result = await getClient().generateVideo(args as VideoGenerateParams)
        return videoResult(result)
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
