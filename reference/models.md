# Models

Model availability and pricing change over time. **Always discover the live list** rather than hard-coding:

- MCP: `list_models` tool
- CLI: `aims models` (or `aims models --type image|video`)
- HTTP: `GET /api/v1/models`, or `GET /api/v1/images/generate` / `GET /api/v1/videos/generate`

Discovery returns each model's base `credit_cost`. The prices below are a snapshot of AI Media Studio's lineup on 23 November 2026, for orientation. **Image models are priced per image; video models are priced per second.**

## Defaults

When a request names no `model`, the API uses:

- Images: `fal-ai/nano-banana-pro` (Nano Banana Pro). With `image_urls`, its edit endpoint.
- Video: `fal-ai/kling-video/o3/pro/text-to-video` (Kling O3 Pro).

## Image models (credits per image)

| Model id | Name | Credits |
| --- | --- | --- |
| `fal-ai/nano-banana-pro` | Nano Banana Pro (default) | 30 at 1K or 2K, 60 at 4K |
| `google/nano-banana-2.1` | Nano Banana 2.1 | 8 / 12 / 27 at 1K / 2K / 4K (edits 9 / 14 / 31) |
| `openai/gpt-image-2.5/flare/text-to-image` | GPT Image 2.5 Flare | 2 / 3 / 11 at low / medium / high quality (edits 3 / 5 / 13) |
| `openai/gpt-image-2.6/flare/text-to-image` | GPT Image 2.6 Flare | 5 / 9 / 15 at low / medium / high quality (edits 7 / 11 / 13) |
| `meta/muse-image/text-to-image` | Muse Image | 2 |
| `blackforestlabs/flux-3/text-to-image` | FLUX 3 Image | 10 (about 1 MP) |

- GPT Image 2.5 and 2.6 also come as `…/sunburst/text-to-image`, a more detailed variant at the same price. Their prices are for outputs up to about 2.4 MP; larger sizes cost more.
- Every image model also edits. Passing `image_urls` routes to the model's edit endpoint (for example `fal-ai/nano-banana-pro/edit`, `openai/gpt-image-2.6/flare/edit`), so you rarely need to name an edit id.

## Video models (credits per second)

| Model id | Name | Credits per second | Length |
| --- | --- | --- | --- |
| `fal-ai/kling-video/o3/pro/text-to-video` | Kling O3 Pro (default) | 17, or 21 with `audio: true` | 3 to 15 s |
| `fal-ai/kling-video/v3/pro/text-to-video` | Kling v3 Pro | 17, or 25 with `audio: true` | 3 to 15 s |
| `kling/v4/text-to-video` | Kling 4.0 | 23 at 720p, 34 at 1080p; sound always included | 3 to 15 s |
| `bytedance/seedance-2.0/text-to-video` | Seedance 2.0 | 21 / 44 / 99 at 480p / 720p / 1080p | 4 to 15 s |
| `xai/grok-imagine-video/v1.5/text-to-video` | Grok Imagine Video 1.5 | 12 / 21 / 36 at 480p / 720p / 1080p; sound always included | 1 to 15 s |
| `blackforestlabs/flux-3-max/text-to-video` | FLUX 3 Max | 25 / 42 / 58 / 115 at 720p / 1080p / 2K / 4K | 5 to 20 s |

- **Image-to-video:** replace `/text-to-video` with `/image-to-video` in any id above and pass `image_url`.
- **Start and end frames:** pass the start frame as `image_url` and the end frame as `last_frame_url` to the image-to-video id of Kling O3 Pro, Kling v3 Pro, Kling 4.0, Seedance 2.0 or FLUX 3 Max.
- **Reference-to-video:** `fal-ai/kling-video/o3/pro/reference-to-video` or `bytedance/seedance-2.0/reference-to-video` with `image_urls`.
- No current model extends an existing video.

## Choosing a model

- **Images:** Nano Banana Pro for realistic photos and final images, Nano Banana 2.1 for cheap drafts, GPT Image 2.5 Flare for readable text (posters, labels, menus), Muse Image for the lowest price.
- **Video:** Kling O3 Pro as the all-rounder, Grok Imagine Video 1.5 for the lowest price, Seedance 2.0 or FLUX 3 Max for top quality, Kling 4.0 when every clip should have sound.

## Estimating cost

- Image: per-image credits × `n`. Nano Banana prices rise with `resolution`; GPT Image prices depend on `quality` and size.
- Video: credits per second × duration, rounded up. Resolution and, on the Kling O3 and v3 models, `audio` change the per-second rate.
- Discovery's `credit_cost` is the base rate, so a higher resolution, quality, or audio can cost more. To be sure a call stays within what the user approved, pass `max_credits`: a higher price is refused with 400 `MAX_CREDITS_EXCEEDED` and nothing is charged.
