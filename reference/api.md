# AIMS HTTP API reference

Base URL: `https://app.ai-media-studio.com/api/v1`
Auth: `Authorization: Bearer $AIMS_API_KEY` (or `X-API-Key: $AIMS_API_KEY`)

Request and response bodies are JSON except image uploads, which use multipart form data.

## POST /uploads

Upload a source image into the API key's workspace. Requires `media:write`. Send one multipart `file` containing PNG, JPEG, WebP, GIF, AVIF, HEIC, or BMP data, up to 20 MiB. The server verifies the file bytes and derives workspace ownership from the API key.

```bash
curl -X POST https://app.ai-media-studio.com/api/v1/uploads \
  -H "Authorization: Bearer $AIMS_API_KEY" \
  -F "file=@./photo.png"
```

```json
{ "success": true, "id": "uuid", "url": "https://cdn.ai-media-studio.com/workspaces/WORKSPACE_ID/uploads/source.png" }
```

Use the returned URL for image editing or video image references. Arbitrary externally hosted image URLs are not accepted. CLI users can run `aims upload ./photo.png --print url`; MCP users can call `upload_image` with supplied raw `image_base64` contents and an optional `filename`. MCP uploads read no local files.

---

## POST /images/generate

Generate one or more images. Provide `image_urls` to switch to image-to-image editing.

### Request body

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `prompt` | string | — | **Required.** Text description. |
| `model` | string | workspace default | Model id, e.g. `fal-ai/nano-banana-2`. |
| `n` | integer | 1 | 1–8 images. |
| `aspect_ratio` | string | model default | `auto`, `21:9`, `16:9`, `3:2`, `4:3`, `5:4`, `1:1`, `4:5`, `3:4`, `2:3`, `9:16`. Takes precedence over `size`. |
| `size` | string | `1024x1024` | Pixel size for OpenAI models, e.g. `1536x1024`. |
| `resolution` | string | model default | `0.5K`, `1K`, `2K`, `4K` (model dependent). |
| `output_format` | string | `png` | `png`, `jpeg`, `webp`. |
| `quality` | string | model default | `low`, `medium`, `high`, `auto` (model dependent). |
| `background` | string | `auto` | `auto`, `transparent`, `opaque` (GPT image models). |
| `style_slug` | string | — | Style preset slug, e.g. `anime-style`. |
| `image_urls` | string[] | none | 1 to 10 workspace-hosted image URLs for image editing. |
| `seed` | integer | — | Deterministic output. |
| `safety_tolerance` | string | model default | `"1"` (strict) … `"6"` (lenient). |
| `make_public` | boolean | false | Returns a `share_url`. |

### Response

```json
{
  "success": true,
  "images": [
    { "id": "uuid", "url": "https://cdn.ai-media-studio.com/…/image.png", "status": "completed", "credits_refunded": 0 }
  ],
  "credits_used": 25,
  "credits_remaining": 9975,
  "style_applied": "anime-style"
}
```

Failed images include `status: "failed"`, an `error`, and `credits_refunded`. Batch responses remain HTTP 200 so callers retain per-image outcomes. `success` is false when no image completed. Partial batches include both completed and failed images. The CLI exits 1 and MCP sets `isError: true` for any image failure while preserving all results.

---

## POST /videos/generate

Generate a video. Credits are charged **per second** of output.

### Request body

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `prompt` | string | — | **Required.** |
| `model` | string | `fal-ai/veo3.1/fast` | Video model id. |
| `duration` | integer | model default | Seconds; snapped to the nearest supported value. |
| `aspect_ratio` | string | model default | e.g. `16:9`, `9:16`. |
| `audio` | boolean | false | Enable audio when supported. |
| `image_url` | string | — | Source image for image-to-video models. |
| `image_urls` | string[] | — | Reference images for reference-to-video models. |
| `first_frame_url` / `last_frame_url` | string | — | First-last-frame models. |
| `extend_video_url` | string | — | Extend-video models. |
| `resolution` | string | — | When supported (e.g. `720p`, `1080p`). |
| `negative_prompt` | string | — | When supported. |
| `cfg_scale` | number | — | When supported. |
| `make_public` | boolean | false | Returns a `share_url`. |

### Response

```json
{
  "success": true,
  "video": {
    "id": "uuid",
    "url": "https://v3.fal.media/files/…/output.mp4",
    "status": "completed",
    "model": "fal-ai/veo3.1/fast",
    "duration": 6,
    "aspect_ratio": "16:9",
    "audio": false
  },
  "credits_used": 180,
  "credits_remaining": 9820
}
```

---

## GET /images/generate · GET /videos/generate

Health check + model discovery. Returns:

```json
{
  "status": "ok",
  "workspace_id": "uuid",
  "credits_available": 9975,
  "scopes": ["image:generate", "video:generate", "media:read", "media:write"],
  "available_models": [
    { "id": "fal-ai/nano-banana-2", "name": "Nano Banana 2", "model_type": "text2img", "credit_cost": 25 }
  ]
}
```

`GET /images/generate` returns image models; `GET /videos/generate` returns video models.

## GET /models

Combined model discovery. Optional `?type=image` or `?type=video`.

```json
{
  "status": "ok",
  "workspace_id": "uuid",
  "image_models": [ /* ModelInfo[] */ ],
  "video_models": [ /* ModelInfo[] */ ]
}
```

---

## Errors

```json
{ "error": "Prompt is required" }
```

| Status | Meaning |
| --- | --- |
| 400 | Invalid request body or parameter |
| 401 | Missing/invalid/expired API key |
| 402 | Insufficient credits |
| 403 | API key missing the required scope |
| 429 | Rate limit exceeded |
| 500 | Server or provider failure (credits refunded) |
