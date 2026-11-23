---
name: aims-generate-image
description: Generate images from a text prompt with AI Media Studio (AIMS). Use when the user asks to create, generate, draw, design, render, or make an image, picture, photo, logo, illustration, icon, banner, or thumbnail — or to turn a description into a visual.
---

# Generate images with AI Media Studio (AIMS)

Create images via the AIMS API. There are three ways to call it — **prefer the first one that is available**:

1. **MCP tool** `generate_image` — if the `aims` MCP server is connected. Pass `prompt` plus any of `model`, `aspect_ratio`, `size`, `n`, `resolution`, `output_format`, `quality`, `style_slug`, `seed`, `image_urls`, `make_public`. The tool returns JSON (`url`, `id`, `credits_used`).
2. **CLI** `aims image "<prompt>" --json` — if the `aims` CLI is installed (`aims login --key` or `AIMS_API_KEY`). Never run `aims login` without `--key`.
3. **HTTP** — `POST https://app.ai-media-studio.com/api/v1/images/generate` with `Authorization: Bearer $AIMS_API_KEY`.

## Inputs to gather

- **prompt** (required): a vivid, specific description. Include subject, style, lighting, composition, mood.
- **model** (optional): see recommended models below. Omit it to use the API default, `fal-ai/nano-banana-pro`.
- **aspect_ratio** (optional): `1:1`, `16:9`, `9:16`, `4:5`, `3:2`, etc. It takes precedence over `size`.
- **size** (optional): pixel dimensions for GPT Image models, e.g. `1024x1024`, `1536x1024`.
- **resolution** (optional): `1K`, `2K` or `4K` for Nano Banana models.
- **n** (optional): number of variations, 1–8. Default 1.
- **output_format** (optional): `png`, `jpeg`, or `webp`. Default `png`.
- **quality** (optional): `low`, `medium`, `high`, or `auto` (model dependent).
- **style_slug** (optional): style preset slug, e.g. `anime-style`.
- **seed** (optional): integer seed for deterministic/reproducible output.
- **image_urls** (optional): workspace-hosted source image URLs. Upload local files with `upload_image` or `aims upload <file>` first. Use the `aims-edit-image` skill for the upload and editing workflow.

## Recommended models (credits are per image)

Prices as of 23 November 2026; `list_models` returns the live list.

- `fal-ai/nano-banana-pro` — Nano Banana Pro, realistic photos and final images. 30 at 1K or 2K, 60 at 4K. **The default when you omit `model`.**
- `google/nano-banana-2.1` — Nano Banana 2.1, fast drafts and variations. 8 at 1K, 12 at 2K, 27 at 4K.
- `openai/gpt-image-2.5/flare/text-to-image` — GPT Image 2.5 Flare, the best pick for readable text (posters, labels, menus). 2, 3 or 11 at low, medium or high quality.
- `openai/gpt-image-2.6/flare/text-to-image` — GPT Image 2.6 Flare. 5, 9 or 15 at low, medium or high quality. Both GPT Image models have a `/sunburst/` variant with more detail at the same price.
- `meta/muse-image/text-to-image` — Muse Image, the cheapest (2).
- `blackforestlabs/flux-3/text-to-image` — FLUX 3 Image (10, about 1 MP).

Discover what's live for the workspace with the `list_models` MCP tool, `aims models --type image`, or `GET /api/v1/images/generate`.

## Steps

1. Turn the user's request into a strong prompt. Ask for clarification only if the request is ambiguous (subject, style, or aspect ratio).
2. Pick a model. Omit `model` for Nano Banana Pro unless the user needs crisp text (use `openai/gpt-image-2.5/flare/text-to-image`) or cheap drafts (`google/nano-banana-2.1`).
3. Call the API (MCP tool > CLI > HTTP).
4. Return the resulting image URL(s) to the user. Report `credits_used` and `credits_remaining`.
5. Inspect per-image outcomes. Partial and total failures set MCP `isError` or CLI exit 1 while retaining completed results. Retry only failed work.

## HTTP example

```bash
curl -X POST https://app.ai-media-studio.com/api/v1/images/generate \
  -H "Authorization: Bearer $AIMS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "a red panda astronaut floating in a nebula, cinematic studio lighting",
    "model": "fal-ai/nano-banana-pro",
    "aspect_ratio": "16:9",
    "n": 1
  }'
```

Response (abridged):

```json
{
  "success": true,
  "images": [{ "id": "…", "url": "https://cdn.ai-media-studio.com/…/image.png", "status": "completed" }],
  "credits_used": 30,
  "credits_remaining": 9970
}
```

## CLI example

```bash
aims image "a minimalist logo of a mountain, flat vector" -m google/nano-banana-2.1 -a 1:1 --json
```

## Notes

- Each generation spends workspace credits; failed images are automatically refunded.
- Set `make_public: true` to get a public `share_url`.
- Image URLs are served from `cdn.ai-media-studio.com`. To save locally, use the CLI `--output` flag or fetch the URL.
