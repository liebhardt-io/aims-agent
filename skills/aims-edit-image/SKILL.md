---
name: aims-edit-image
description: Edit, transform, restyle, or combine existing images with a text instruction using AI Media Studio (AIMS) image-to-image. Use when the user provides one or more image URLs and wants changes (e.g. "make this a night scene", "remove the background", "combine these", "turn this into a watercolor").
---

# Edit images (image-to-image) with AI Media Studio (AIMS)

Transform existing images with a text instruction. This uses the same image endpoint with `image_urls` supplied. **Prefer the first available method:**

1. **MCP tool** `edit_image` — pass `prompt` and `image_urls` (1–10 http/https URLs). Returns JSON.
2. **CLI** `aims edit "<instruction>" --image-url <url> --json`.
3. **HTTP** — `POST https://app.ai-media-studio.com/api/v1/images/generate` with an `image_urls` array.

## Inputs to gather

- **prompt** (required): the edit instruction (what to change/add/remove/restyle).
- **image_urls** (required): 1–10 publicly reachable http/https image URLs. Local files must be uploaded to a public URL first.
- **model** (optional): defaults to an edit-capable model. Examples: `fal-ai/nano-banana-2`, `fal-ai/nano-banana-pro`, `fal-ai/flux-pro/kontext`, `openai/gpt-image-2`.
- **aspect_ratio** (optional): defaults to `auto` to preserve the original proportions.

## Steps

1. Confirm you have valid http/https image URL(s). If the user has a local file, ask them to host it (or use a previously generated AIMS URL).
2. Write a clear edit instruction.
3. Call the API with `image_urls`.
4. Return the edited image URL and report credits used/remaining.

## HTTP example

```bash
curl -X POST https://app.ai-media-studio.com/api/v1/images/generate \
  -H "Authorization: Bearer $AIMS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "turn this into a moody cinematic night scene with neon reflections",
    "model": "fal-ai/nano-banana-2",
    "image_urls": ["https://example.com/source.jpg"],
    "aspect_ratio": "auto"
  }'
```

## CLI example

```bash
aims edit "combine these into a single product collage on a white background" \
  --image-url https://example.com/a.jpg \
  --image-url https://example.com/b.jpg \
  --json
```

## Notes

- Up to 10 source images may be combined.
- `image_urls` must be valid http/https URLs.
- Each edit spends credits; failures are refunded.
