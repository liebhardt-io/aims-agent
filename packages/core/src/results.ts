import type { ImageGenerateResult } from "./types.js"

export function imageGenerationOutcome(result: ImageGenerateResult) {
  const completed = result.images.filter((image) => image.status === "completed" && image.url).length
  const failed = result.images.length - completed
  return {
    result: { ...result, success: result.success && completed > 0 },
    failed,
    isError: !result.success || completed === 0 || failed > 0,
  }
}
