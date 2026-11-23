import type { ImageGenerateResult, VideoGenerateResult } from "./types.js"

/**
 * Split a batch into completed, failed and still-generating images. An image
 * still generating is charged if it completes, so it must never be retried.
 */
export function imageGenerationOutcome(result: ImageGenerateResult) {
  const completed = result.images.filter((image) => image.status === "completed" && image.url).length
  const pending = result.images.filter((image) => image.status === "generating").map((image) => image.id)
  const failed = result.images.length - completed - pending.length
  return {
    result: { ...result, success: result.success && completed > 0 },
    failed,
    pending,
    isError: !result.success || completed === 0 || failed > 0 || pending.length > 0,
  }
}

/** The API reports video failures as HTTP errors today; guard against a 200 without a completed video too. */
export function videoGenerationOutcome(result: VideoGenerateResult) {
  const completed = result.video?.status === "completed" && Boolean(result.video.url)
  return { result, isError: !result.success || !completed }
}

export const STILL_GENERATING_HINT =
  "Still generating, and charged if it completes. Do not generate it again: check it later with aims media <id> or the get_media MCP tool."
