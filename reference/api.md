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
| `model` | string | `fal-ai/nano-banana-pro` | Model id, e.g. `google/nano-banana-2.1`. See [models.md](models.md). |
| `n` | integer | 1 | 1–8 images; Nano Banana and GPT Image models return at most 4. |
| `aspect_ratio` | string | model default | `auto`, `21:9`, `16:9`, `3:2`, `4:3`, `5:4`, `1:1`, `4:5`, `3:4`, `2:3`, `9:16`. Takes precedence over `size`. |
| `size` | string | `1024x1024` | Pixel size for GPT Image models, e.g. `1536x1024`. |
| `resolution` | string | model default | `0.5K`, `1K`, `2K`, `4K` (model dependent). |
| `output_format` | string | `png` | `png`, `jpeg`, `webp`. |
| `quality` | string | model default | `low`, `medium`, `high`, `auto` (model dependent). |
| `style_slug` | string | — | Style preset slug, e.g. `anime-style`. |
| `image_urls` | string[] | none | 1 to 10 workspace-hosted image URLs for image editing. |
| `seed` | integer | — | Deterministic output. |
| `safety_tolerance` | string | model default | `"1"` (strict) … `"6"` (lenient). |
| `make_public` | boolean | false | Returns a `share_url`. |
| `max_credits` | number | none | Refuse with 400 `MAX_CREDITS_EXCEEDED`, charging nothing, if the request would cost more. |

### Response

```json
{
  "success": true,
  "images": [
    { "id": "uuid", "url": "https://cdn.ai-media-studio.com/…/image.png", "status": "completed", "credits_refunded": 0 }
  ],
  "credits_used": 30,
  "credits_remaining": 9970,
  "style_applied": "anime-style"
}
```

Failed images include `status: "failed"`, an `error`, and `credits_refunded`. Batch responses remain HTTP 200 so callers retain per-image outcomes. If any image is still running when the request returns, the response is **HTTP 202** and that image has `status: "generating"` and `url: null`: it is charged if it completes, so poll `GET /media/{id}` instead of generating it again. `success` is false when no image completed. Partial batches include both completed and failed images. The CLI exits 1 and MCP sets `isError: true` for any image failure while preserving all results.

---

## POST /videos/generate

Generate a video. Credits are charged **per second** of output.

### Request body

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `prompt` | string | — | **Required.** |
| `model` | string | `fal-ai/kling-video/o3/pro/text-to-video` | Video model id. |
| `duration` | integer | model default | Seconds; snapped to the nearest supported value. |
| `aspect_ratio` | string | model default | e.g. `16:9`, `9:16`. |
| `audio` | boolean | false | Enable audio when supported. |
| `image_url` | string | — | Source image for image-to-video models. |
| `image_urls` | string[] | — | Reference images for reference-to-video models. |
| `first_frame_url` / `last_frame_url` | string | — | Start and end frame. Send the end frame with `image_url` to a Kling, Seedance 2.0 or FLUX 3 Max image-to-video model; `first_frame_url` also works as the start frame on Kling and FLUX 3 Max. |
| `extend_video_url` | string | — | Extend-video models. No current model extends videos. |
| `resolution` | string | — | When supported (e.g. `720p`, `1080p`). |
| `negative_prompt` | string | — | When supported. |
| `cfg_scale` | number | — | When supported. |
| `seed` | integer | none | When supported. |
| `make_public` | boolean | false | Returns a `share_url`. |
| `max_credits` | number | none | Refuse with 400 `MAX_CREDITS_EXCEEDED`, charging nothing, if the clip would cost more. |

### Response

```json
{
  "success": true,
  "video": {
    "id": "uuid",
    "url": "https://v3.fal.media/files/…/output.mp4",
    "status": "completed",
    "model": "fal-ai/kling-video/o3/pro/text-to-video",
    "duration": 6,
    "aspect_ratio": "16:9",
    "audio": false
  },
  "credits_used": 102,
  "credits_remaining": 9898
}
```

A request can outlive the provider wait. Then the response is HTTP 503 with `media_id` and `status: "generating"`: the video is still running and is charged if it completes. Poll `GET /media/{id}`; do not send the request again.

---

## GET /media/{id}

Status of one generation in the key's workspace. Requires `media:read`.

```json
{
  "success": true,
  "media": {
    "id": "uuid",
    "type": "video",
    "status": "completed",
    "url": "https://v3.fal.media/files/…/output.mp4",
    "model": "fal-ai/kling-video/o3/pro/text-to-video",
    "created_at": "2026-11-23T10:00:00Z",
    "updated_at": "2026-11-23T10:03:12Z"
  }
}
```

`status` is `generating`, `completed`, or `failed`. `url` is present only when completed, `error` only when failed, and `share_url` only for public completed media. Unknown ids and ids from other workspaces return 404. CLI: `aims media <id>`; MCP: `get_media`.

## DELETE /keys/current

Revokes the API key that sends the request and returns `{ "success": true, "revoked": true }`. A key can revoke only itself. CLI: `aims logout --revoke`.

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
    { "id": "fal-ai/nano-banana-pro", "name": "Nano Banana Pro", "model_type": "text2img", "credit_cost": 30 }
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
{ "error": "This request costs 90 credits, more than max_credits (60). Nothing was charged.", "code": "MAX_CREDITS_EXCEEDED", "required": 90, "max_credits": 60 }
```

Some errors add a `code`, a `media_id`, or a `status` next to `error`.

| Status | Meaning | Retry? |
| --- | --- | --- |
| 202 | Image batch returned while an image is still `generating` | No: poll `GET /media/{id}` |
| 400 | Invalid request body or parameter; code `MAX_CREDITS_EXCEEDED` when the price is above `max_credits` | No, fix the request |
| 401 | Missing, invalid, expired, or revoked API key | No |
| 402 | Code `PAID_PLAN_REQUIRED`: the workspace needs a paid plan, even with credits left. Without a code: not enough credits | No, see https://app.ai-media-studio.com/billing |
| 403 | API key missing the required scope | No |
| 404 | Unknown media id | No |
| 410 | Model discontinued | No, choose a current model from `GET /models` |
| 429 | Rate limit exceeded | After a pause |
| 500 | Generation failed; a `media_id` that failed is refunded | Yes, once |
| 503 | With `status: "generating"`: still running and charged if it completes. Otherwise the service could not start or settle the job | Poll `GET /media/{id}` when a `media_id` is present; otherwise retry later |
