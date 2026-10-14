import type { ImageGenerateResult, VideoGenerateResult } from "./types.js"

export function imageGenerationOutcome(result: ImageGenerateResult) {
  const completed = result.images.filter((image) => image.status === "completed" && image.url).length
  const failed = result.images.length - completed
  return {
    result: { ...result, success: result.success && completed > 0 },
    failed,
    isError: !result.success || completed === 0 || failed > 0,
  }
}

/** The API reports video failures as HTTP errors today; guard against a 200 without a completed video too. */
export function videoGenerationOutcome(result: VideoGenerateResult) {
  const completed = result.video?.status === "completed" && Boolean(result.video.url)
  return { result, isError: !result.success || !completed }
}
