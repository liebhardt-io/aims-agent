---
name: aims-generate-image
description: Generate images from a text prompt with AI Media Studio (AIMS). Use when the user asks to create, generate, draw, design, render, or make an image, picture, photo, logo, illustration, icon, banner, or thumbnail — or to turn a description into a visual.
---

# Generate images with AI Media Studio (AIMS)

Create images via the AIMS API. There are three ways to call it — **prefer the first one that is available**:

1. **MCP tool** `generate_image` — if the `aims` MCP server is connected. Pass `prompt` plus any of `model`, `aspect_ratio`, `size`, `n`, `resolution`, `output_format`, `quality`, `style_slug`, `seed`, `image_urls`, `make_public`.
2. **CLI** `aims image "<prompt>" [options]` — if the `aims` CLI is installed and the user has run `aims login` (or `AIMS_API_KEY` is set).
3. **HTTP** — `POST https://app.ai-media-studio.com/api/v1/images/generate` with `Authorization: Bearer $AIMS_API_KEY`.

## Inputs to gather

- **prompt** (required): a vivid, specific description. Include subject, style, lighting, composition, mood.
- **model** (optional): see recommended models below. Omit to use the workspace default.
- **aspect_ratio** (optional): `1:1`, `16:9`, `9:16`, `4:5`, `3:2`, etc. (Use `aspect_ratio` for Fal models; `size` like `1024x1024` for OpenAI models.)
- **size** (optional): pixel dimensions for OpenAI models, e.g. `1024x1024`, `1536x1024`.
- **n** (optional): number of variations, 1–8. Default 1.
- **output_format** (optional): `png`, `jpeg`, or `webp`. Default `png`.
- **quality** (optional): `low`, `medium`, `high`, or `auto` (model dependent).
- **style_slug** (optional): style preset slug, e.g. `anime-style`.
- **seed** (optional): integer seed for deterministic/reproducible output.
- **image_urls** (optional): http/https URLs to edit/transform existing images (image-to-image). Use the `aims-edit-image` skill for edit-focused requests.

## Recommended models (credits are per image)

- `fal-ai/nano-banana-2` — fast and cheap (25). **Good default.**
- `fal-ai/bytedance/seedream/v4/text-to-image` — cheapest (10).
- `fal-ai/nano-banana-pro` — higher quality (50).
- `openai/gpt-image-2` — excellent text/typography rendering (70).
- `fal-ai/gpt-image-1.5` — solid all-rounder (30).

Discover what's live for the workspace with the `list_models` MCP tool, `aims models --type image`, or `GET /api/v1/images/generate`.

## Steps

1. Turn the user's request into a strong prompt. Ask for clarification only if the request is ambiguous (subject, style, or aspect ratio).
2. Pick a model. Default to `fal-ai/nano-banana-2` unless the user needs crisp text (use `openai/gpt-image-2`) or top quality (`fal-ai/nano-banana-pro`).
3. Call the API (MCP tool > CLI > HTTP).
4. Return the resulting image URL(s) to the user. Report `credits_used` and `credits_remaining`.

## HTTP example

```bash
curl -X POST https://app.ai-media-studio.com/api/v1/images/generate \
  -H "Authorization: Bearer $AIMS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "a red panda astronaut floating in a nebula, cinematic studio lighting",
    "model": "fal-ai/nano-banana-2",
    "aspect_ratio": "16:9",
    "n": 1
  }'
```

Response (abridged):

```json
{
  "success": true,
  "images": [{ "id": "…", "url": "https://cdn.ai-media-studio.com/…/image.png", "status": "completed" }],
  "credits_used": 25,
  "credits_remaining": 9975
}
```

## CLI example

```bash
aims image "a minimalist logo of a mountain, flat vector" -m fal-ai/nano-banana-2 -a 1:1 --output ./out
```

## Notes

- Each generation spends workspace credits; failed images are automatically refunded.
- Set `make_public: true` to get a public `share_url`.
- Image URLs are served from `cdn.ai-media-studio.com`. To save locally, use the CLI `--output` flag or fetch the URL.
