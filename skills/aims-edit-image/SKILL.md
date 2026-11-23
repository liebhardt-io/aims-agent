---
name: aims-edit-image
description: Edit, transform, restyle, or combine existing images with a text instruction using AI Media Studio (AIMS) image-to-image. Use when the user provides one or more image URLs and wants changes (e.g. "make this a night scene", "remove the background", "combine these", "turn this into a watercolor").
---

# Edit images (image-to-image) with AI Media Studio (AIMS)

Transform existing images with a text instruction. This uses the same image endpoint with `image_urls` supplied. **Prefer the first available method:**

1. **MCP tool** `edit_image` with `prompt` and `image_urls`, containing 1 to 10 workspace-hosted URLs. Returns JSON.
2. **CLI** `aims edit "<instruction>" --image-url <url> --json`, with `aims login --key` or `AIMS_API_KEY`. Do not run bare `aims login` (it opens a browser); use `aims login --key`, or run `aims login --web --no-browser` only when the user wants browser approval and give them the printed URL.
3. **HTTP** — `POST https://app.ai-media-studio.com/api/v1/images/generate` with an `image_urls` array.

## Inputs to gather

- **prompt** (required): the edit instruction (what to change/add/remove/restyle).
- **image_urls** (required): 1 to 10 workspace-hosted image URLs. Upload local files with MCP `upload_image` (raw base64 contents), CLI `aims upload <file>`, or HTTP `POST /uploads` (multipart field `file`) first. Uploads require the `media:write` scope and accept raster images up to 20 MiB.
- **model** (optional): omit it to edit with Nano Banana Pro (`fal-ai/nano-banana-pro`, 30 credits at 1K or 2K). Other choices: `google/nano-banana-2.1` (9 at 1K), `openai/gpt-image-2.6/flare/text-to-image` (7, 11 or 13 at low, medium or high quality), `meta/muse-image/text-to-image` (2), `blackforestlabs/flux-3/text-to-image` (10). The API switches each to its edit endpoint.
- **aspect_ratio** (optional): defaults to `auto` to preserve the original proportions.
- **n**, **seed**, **quality**, **style_slug**, **size**, **max_credits** (optional): same meaning as for image generation; `n` (1-8, at most 4 on Nano Banana and GPT Image) returns several edited variations.

## Steps

1. Use source image URLs from the API key's workspace. For a local file, run `aims upload <file> --print url` and use the returned URL. MCP `upload_image` accepts supplied raw `image_base64` contents, not file paths. Arbitrary external image URLs are not accepted.
2. Write a clear edit instruction.
3. Call the API with `image_urls`.
4. Return completed image URLs and report credits used/remaining. Partial and total failures set MCP `isError` or CLI exit 1 while retaining all results. Retry only images with `status: "failed"`.

## Results you must not retry

- **`status: "generating"`** (an image in an HTTP 202 batch, or a video error with `media_id`): still running, and charged if it completes. Never generate it again. Check it later with MCP `get_media`, `aims media <id>`, or `GET /api/v1/media/{id}` (scope `media:read`).
- **402 with code `PAID_PLAN_REQUIRED`**: the workspace has no paid plan, even if it still has credits. Send the user to https://app.ai-media-studio.com/billing.
- **402 without a code**: not enough credits for this request.
- **400 with code `MAX_CREDITS_EXCEEDED`**: nothing was charged; the price is in `required`.
- **410**: the model is discontinued; pick a current one with `list_models`.
- **No response in time** (CLI code `CLIENT_TIMEOUT`): the generation may still complete and be charged; check the workspace before repeating it.

## HTTP example

```bash
curl -X POST https://app.ai-media-studio.com/api/v1/images/generate \
  -H "Authorization: Bearer $AIMS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "turn this into a moody cinematic night scene with neon reflections",
    "model": "fal-ai/nano-banana-pro",
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
