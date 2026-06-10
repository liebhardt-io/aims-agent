# AIMS HTTP API reference

Base URL: `https://app.ai-media-studio.com/api/v1`
Auth: `Authorization: Bearer $AIMS_API_KEY` (or `X-API-Key: $AIMS_API_KEY`)

All request/response bodies are JSON.

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
| `image_urls` | string[] | — | 1–10 http/https URLs → image-to-image edit. |
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

Failed images include `status: "failed"`, an `error`, and `credits_refunded`.

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
