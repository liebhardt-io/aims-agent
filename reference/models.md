# Models

Model availability and pricing change over time. **Always discover the live list** rather than hard-coding:

- MCP: `list_models` tool
- CLI: `aims models` (or `aims models --type image|video`)
- HTTP: `GET /api/v1/models`, or `GET /api/v1/images/generate` / `GET /api/v1/videos/generate`

Credit costs below are a snapshot for orientation. **Image models are priced per image; video models are priced per second.**

## Image models (credits per image)

| Model id | Name | Credits |
| --- | --- | --- |
| `fal-ai/bytedance/seedream/v4/text-to-image` | Seedream V4 | 10 |
| `fal-ai/nano-banana-2` | Nano Banana 2 | 25 |
| `fal-ai/gpt-image-1.5` | GPT Image 1.5 | 30 |
| `fal-ai/nano-banana-pro` | Nano Banana Pro | 50 |
| `openai/gpt-image-2` | GPT Image 2 | 70 |

Image editing (image-to-image) variants exist too, e.g. `fal-ai/nano-banana-2/edit`, `fal-ai/flux-pro/kontext`, `openai/gpt-image-2/edit`, `fal-ai/bytedance/seedream/v4/edit`. You usually don't need to pick an edit model explicitly — passing `image_urls` routes to the edit path automatically.

## Video models (credits per second)

| Model id | Name | Credits/s |
| --- | --- | --- |
| `fal-ai/veo3.1/lite` | Veo 3.1 Lite | 15 |
| `xai/grok-imagine-video/text-to-video` | Grok Imagine | 15 |
| `bytedance/seedance-2.0/fast/text-to-video` | Seedance 2.0 Fast | 20 |
| `bytedance/seedance-2.0/text-to-video` | Seedance 2.0 | 25 |
| `fal-ai/veo3.1/fast` | Veo 3.1 Fast | 30 |
| `fal-ai/sora-2/text-to-video` | Sora 2 | 35 |
| `fal-ai/sora-2/text-to-video/pro` | Sora 2 Pro | 50 |
| `fal-ai/kling-video/v3/standard/text-to-video` | Kling v3 Standard | 67 |
| `fal-ai/kling-video/v3/pro/text-to-video` | Kling v3 Pro | 70 |

For **image-to-video**, use an `…/image-to-video` model id and pass `image_url`, e.g. `fal-ai/veo3.1/fast/image-to-video`, `bytedance/seedance-2.0/fast/image-to-video`, `fal-ai/kling-video/v3/standard/image-to-video`.

For **reference-to-video** use `…/reference-to-video` with `image_urls`.

## Choosing a model

- **Cheapest image:** Seedream V4. **Best default image:** Nano Banana 2. **Best text rendering:** GPT Image 2.
- **Best default video:** Veo 3.1 Fast. **Cheapest video:** Veo 3.1 Lite / Grok Imagine. **Premium:** Kling v3 / Sora 2 Pro.

## Estimating cost

- Image: `credits = credit_cost × n`.
- Video: `credits ≈ credit_cost × duration_seconds` (audio and resolution can add a multiplier on some models).
