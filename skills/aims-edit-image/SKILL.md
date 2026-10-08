---
name: aims-edit-image
description: Edit, transform, restyle, or combine existing images with a text instruction using AI Media Studio (AIMS) image-to-image. Use when the user provides one or more image URLs and wants changes (e.g. "make this a night scene", "remove the background", "combine these", "turn this into a watercolor").
---

# Edit images (image-to-image) with AI Media Studio (AIMS)

Transform existing images with a text instruction. This uses the same image endpoint with `image_urls` supplied. **Prefer the first available method:**

1. **MCP tool** `edit_image` with `prompt` and `image_urls`, containing 1 to 10 workspace-hosted URLs. Returns JSON.
2. **CLI** `aims edit "<instruction>" --image-url <url> --json`.
3. **HTTP** — `POST https://app.ai-media-studio.com/api/v1/images/generate` with an `image_urls` array.

## Inputs to gather

- **prompt** (required): the edit instruction (what to change/add/remove/restyle).
- **image_urls** (required): 1 to 10 workspace-hosted image URLs. Upload local files with MCP `upload_image`, CLI `aims upload <file>`, or HTTP `POST /uploads` first. Uploads require `media:write`; see [the upload contract](../../reference/api.md#post-uploads).
- **model** (optional): defaults to an edit-capable model. Examples: `fal-ai/nano-banana-2`, `fal-ai/nano-banana-pro`, `fal-ai/flux-pro/kontext`, `openai/gpt-image-2`.
- **aspect_ratio** (optional): defaults to `auto` to preserve the original proportions.

## Steps

1. Use source image URLs from the API key's workspace. For a local file, call `upload_image` with its absolute `file_path` or `aims upload <file> --print url`, then use the returned URL. Arbitrary external image URLs are not accepted.
2. Write a clear edit instruction.
3. Call the API with `image_urls`.
4. Return completed image URLs and report credits used/remaining. Partial and total failures set MCP `isError` or CLI exit 1 while retaining all results. Retry only failed work.

## HTTP example

```bash
curl -X POST https://app.ai-media-studio.com/api/v1/images/generate \
  -H "Authorization: Bearer $AIMS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "turn this into a moody cinematic night scene with neon reflections",
    "model": "fal-ai/nano-banana-2",
    "image_urls": ["WORKSPACE_URL_FROM_UPLOAD"],
    "aspect_ratio": "auto"
  }'
```

## CLI example

```bash
a_url=$(aims upload ./a.jpg --print url) &&
  b_url=$(aims upload ./b.jpg --print url) &&
  aims edit "combine these into a single product collage on a white background" \
    --image-url "$a_url" \
    --image-url "$b_url" \
    --json
```

## Notes

- Up to 10 source images may be combined.
- `image_urls` must belong to the API key's workspace.
- Each edit spends credits; failures are refunded.
