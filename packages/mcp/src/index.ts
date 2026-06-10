#!/usr/bin/env node
/**
 * AIMS MCP server.
 *
 * Exposes AI Media Studio image/video generation as MCP tools over stdio.
 * Reads the API key from the AIMS_API_KEY environment variable (set it when
 * registering the server). Optionally override the API base URL with AIMS_BASE_URL.
 *
 * Register with Claude Code:
 *   claude mcp add aims -e AIMS_API_KEY=aims_xxx -- npx -y -p @ai-media-studio/mcp@latest aims-mcp
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import {
  AimsApiError,
  AimsClient,
  resolveApiKey,
  resolveBaseUrl,
  type ImageGenerateParams,
  type ModelInfo,
  type VideoGenerateParams,
} from "@ai-media-studio/core"

const PACKAGE_VERSION = "0.1.0"

function getClient(): AimsClient {
  const apiKey = resolveApiKey()
  if (!apiKey) {
    throw new Error(
      "AIMS_API_KEY is not set. Provide it when registering the server, e.g.\n" +
        "  claude mcp add aims -e AIMS_API_KEY=aims_xxx -- npx -y -p @ai-media-studio/mcp@latest aims-mcp\n" +
        "Create a key in AI Media Studio under Workspace Settings → API Keys.",
    )
  }
  return new AimsClient({ apiKey, baseUrl: resolveBaseUrl() })
}

type ToolResult = {
  content: Array<{ type: "text"; text: string }>
  isError?: boolean
}

function ok(text: string): ToolResult {
  return { content: [{ type: "text", text }] }
}

function fail(err: unknown): ToolResult {
  let text: string
  if (err instanceof AimsApiError) {
    // 4xx (and network/timeout) carry our own intentional, useful messages
    // (bad input, insufficient credits, missing scope, rate limit). For 5xx,
    // don't forward raw upstream/server details to the agent.
    text =
      err.status >= 500
        ? `AIMS API error (${err.status}): the service failed to process the request. Please try again.`
        : `AIMS API error (${err.status}): ${err.message}`
  } else {
    text = `Error: ${(err as Error)?.message ?? String(err)}`
  }
  return { content: [{ type: "text", text }], isError: true }
}

function formatModels(label: string, models: ModelInfo[], unit: string): string {
  if (!models.length) return `${label}: none available.`
  const rows = models
    .map((m) => `  - ${m.id}  (${m.credit_cost} ${unit}) — ${m.name}`)
    .join("\n")
  return `${label}:\n${rows}`
}

const server = new McpServer({ name: "aims", version: PACKAGE_VERSION })

server.registerTool(
  "generate_image",
  {
    title: "Generate image",
    description:
      "Generate one or more images from a text prompt using AI Media Studio (AIMS). " +
      "Returns hosted image URL(s). Provide image_urls for image-to-image editing. " +
      "Each generation spends workspace credits.",
    inputSchema: {
      prompt: z.string().min(1).describe("Text description of the image to generate."),
      model: z
        .string()
        .optional()
        .describe(
          "Model id. Recommended cheap default: 'fal-ai/nano-banana-2'. Others: 'fal-ai/nano-banana-pro', 'openai/gpt-image-2', 'fal-ai/gpt-image-1.5', 'fal-ai/bytedance/seedream/v4/text-to-image'. Use list_models to discover.",
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
  },
  async (args) => {
    try {
      const client = getClient()
      const result = await client.generateImage(args as ImageGenerateParams)
      const lines = result.images.map((img, i) =>
        img.status === "completed" && img.url
          ? `${i + 1}. ${img.url}${img.share_url ? `  (share: ${img.share_url})` : ""}`
          : `${i + 1}. [${img.status}] ${img.error || "no url"}`,
      )
      return ok(
        `Generated ${result.images.length} image(s). ` +
          `Credits used: ${result.credits_used}, remaining: ${result.credits_remaining}` +
          (result.style_applied ? `, style: ${result.style_applied}` : "") +
          `.\n${lines.join("\n")}`,
      )
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
      "Provide one or more source image URLs (http/https). Returns the edited image URL.",
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
  },
  async (args) => {
    try {
      const client = getClient()
      const result = await client.generateImage(args as ImageGenerateParams)
      const lines = result.images.map((img, i) =>
        img.status === "completed" && img.url
          ? `${i + 1}. ${img.url}${img.share_url ? `  (share: ${img.share_url})` : ""}`
          : `${i + 1}. [${img.status}] ${img.error || "no url"}`,
      )
      return ok(
        `Edited image(s). Credits used: ${result.credits_used}, remaining: ${result.credits_remaining}.\n` +
          lines.join("\n"),
      )
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
      "Video generation can take a few minutes and spends credits per second.",
    inputSchema: {
      prompt: z.string().min(1).describe("Text description of the video to generate."),
      model: z
        .string()
        .optional()
        .describe(
          "Model id. Default 'fal-ai/veo3.1/fast'. Others: 'fal-ai/veo3.1/lite', 'fal-ai/sora-2/text-to-video', 'fal-ai/kling-video/v3/standard/text-to-video', 'bytedance/seedance-2.0/fast/text-to-video'. Use list_models to discover, including image-to-video variants.",
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
  },
  async (args) => {
    try {
      const client = getClient()
      const result = await client.generateVideo(args as VideoGenerateParams)
      const v = result.video
      const body =
        v.status === "completed" && v.url
          ? `${v.url}${v.share_url ? `  (share: ${v.share_url})` : ""}`
          : `[${v.status}] ${v.error || "no url"}`
      return ok(
        `Generated video (${v.model}, ${v.duration}s, ${v.aspect_ratio}, audio: ${v.audio}). ` +
          `Credits used: ${result.credits_used}, remaining: ${result.credits_remaining}.\n${body}`,
      )
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
      "with their ids and credit costs. Use the returned id as the `model` argument.",
    inputSchema: {
      type: z
        .enum(["image", "video"])
        .optional()
        .describe("Filter by 'image' or 'video'. Omit for both."),
    },
  },
  async (args) => {
    try {
      const client = getClient()
      const result = await client.listModels(args.type)
      const parts: string[] = []
      if (args.type !== "video") {
        parts.push(formatModels("Image models", result.image_models, "credits/image"))
      }
      if (args.type !== "image") {
        parts.push(formatModels("Video models", result.video_models, "credits/second"))
      }
      return ok(parts.join("\n\n"))
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
      "Show the API key's workspace id, available credit balance, and granted scopes for AI Media Studio (AIMS).",
    inputSchema: {},
  },
  async () => {
    try {
      const client = getClient()
      const status = await client.account()
      return ok(
        `Workspace: ${status.workspace_id}\n` +
          `Credits available: ${status.credits_available}\n` +
          `Scopes: ${status.scopes.join(", ") || "(none)"}\n` +
          `Image models available: ${status.available_models.length}`,
      )
    } catch (err) {
      return fail(err)
    }
  },
)

async function main(): Promise<void> {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  // Log to stderr so we don't corrupt the stdio JSON-RPC stream.
  process.stderr.write(`aims-mcp ${PACKAGE_VERSION} ready (base: ${resolveBaseUrl()})\n`)
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${(err as Error)?.message ?? String(err)}\n`)
  process.exit(1)
})
