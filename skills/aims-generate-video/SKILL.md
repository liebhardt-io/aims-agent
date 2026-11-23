---
name: aims-generate-video
description: Generate videos from a text prompt (or a source image) with AI Media Studio (AIMS). Use when the user asks to create, generate, animate, or make a video, clip, animation, or motion shot — including text-to-video and image-to-video.
---

# Generate videos with AI Media Studio (AIMS)

Create videos via the AIMS API. **Prefer the first available method:**

1. **MCP tool** `generate_video` if the `aims` MCP server is connected. Pass `prompt` and the selected model's source fields: `image_url` for image-to-video, plus `last_frame_url` for an end frame, or `image_urls` for reference-to-video. Returns JSON with the video URL and credit usage.
2. **CLI** `aims video "<prompt>" --duration 6 --json` — if the `aims` CLI is installed (`aims login --key` or `AIMS_API_KEY`). Never run `aims login` without `--key`.
3. **HTTP** — `POST https://app.ai-media-studio.com/api/v1/videos/generate` with `Authorization: Bearer $AIMS_API_KEY`.

## Inputs to gather

- **prompt** (required): describe the scene, motion, camera movement, and mood.
- **model** (optional): see recommended models below. Omit it to use the API default, `fal-ai/kling-video/o3/pro/text-to-video`.
- **duration** (optional): seconds. The API snaps to the model's nearest supported value.
- **aspect_ratio** (optional): `16:9` (landscape) or `9:16` (vertical/social).
- **audio** (optional): enable generated audio on models with a sound switch (Kling O3 Pro, Kling v3 Pro, Seedance 2.0). Kling 4.0 and Grok Imagine clips always have sound.
- **image_url** (optional): a source image for **image-to-video** models.
- **image_urls** (optional): reference image URLs for **reference-to-video** models.
- **last_frame_url** (optional): an end frame, sent with `image_url` to an image-to-video model (Kling, Seedance 2.0, FLUX 3 Max).
- **resolution** (optional): output resolution when supported (e.g. `720p`, `1080p`).
- **negative_prompt** (optional): elements to avoid, when the model supports it.
- **make_public** (optional): make the result publicly shareable (returns a `share_url`).

## Recommended models (credits are charged PER SECOND)

Prices as of 23 November 2026; `list_models` returns the live list.

- `fal-ai/kling-video/o3/pro/text-to-video` — Kling O3 Pro, the all-rounder. 17/s, 21/s with `audio: true`, 3 to 15 s. **The default when you omit `model`.**
- `fal-ai/kling-video/v3/pro/text-to-video` — Kling v3 Pro, dynamic camera moves. 17/s, 25/s with audio, 3 to 15 s.
- `kling/v4/text-to-video` — Kling 4.0, sound always included. 23/s at 720p, 34/s at 1080p, 3 to 15 s.
- `bytedance/seedance-2.0/text-to-video` — Seedance 2.0, top quality. 21, 44 or 99/s at 480p, 720p or 1080p, 4 to 15 s.
- `xai/grok-imagine-video/v1.5/text-to-video` — Grok Imagine Video 1.5, the cheapest, sound always included. 12, 21 or 36/s at 480p, 720p or 1080p, 1 to 15 s.
- `blackforestlabs/flux-3-max/text-to-video` — FLUX 3 Max, up to 4K. 25, 42, 58 or 115/s at 720p, 1080p, 2K or 4K, 5 to 20 s.

For image-to-video, replace `/text-to-video` with `/image-to-video` in any id above and pass `image_url`. For reference-to-video, use `fal-ai/kling-video/o3/pro/reference-to-video` or `bytedance/seedance-2.0/reference-to-video` with `image_urls`. Discover live models with the `list_models` MCP tool, `aims models --type video`, or `GET /api/v1/videos/generate`.

Upload local source images with MCP `upload_image` (raw base64 contents) or `aims upload <file> --print url` and use the returned workspace URL. Uploads require the `media:write` scope and accept raster images up to 20 MiB; arbitrary external image URLs are not accepted.

> Cost note: a 5-second clip on the default Kling O3 Pro costs 85 credits (17/s × 5 s), or 105 with audio. Confirm with the user before generating long or expensive clips.

## Steps

1. Build a strong prompt (subject, motion, camera, lighting, mood).
2. Pick a model and a sensible `duration`. Omit `model` for Kling O3 Pro unless the user wants something else.
3. Warn the user that video generation can take a few minutes and spends credits per second.
4. Call the API (MCP tool > CLI > HTTP).
5. Return the video URL. Report `credits_used` and `credits_remaining`.

## HTTP example

```bash
curl -X POST https://app.ai-media-studio.com/api/v1/videos/generate \
  -H "Authorization: Bearer $AIMS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "a cinematic drone shot flying over snowy mountains at sunrise",
    "model": "fal-ai/kling-video/o3/pro/text-to-video",
    "duration": 6,
    "aspect_ratio": "16:9"
  }'
```

Image-to-video:

```bash
curl -X POST https://app.ai-media-studio.com/api/v1/videos/generate \
  -H "Authorization: Bearer $AIMS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "slow cinematic reveal, gentle camera push-in",
    "model": "fal-ai/kling-video/o3/pro/image-to-video",
    "duration": 5,
    "image_url": "WORKSPACE_URL_FROM_UPLOAD"
  }'
```

## CLI example

```bash
aims video "a timelapse of clouds over a city skyline" -m fal-ai/kling-video/o3/pro/text-to-video -d 6 -a 16:9 --json
```

## Notes

- The response `video.url` is a direct, hosted MP4 URL.
- Set `make_public: true` for a public `share_url`.
- Credits are refunded automatically if generation fails.
