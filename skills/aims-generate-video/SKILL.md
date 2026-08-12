---
name: aims-generate-video
description: Generate videos from a text prompt (or a source image) with AI Media Studio (AIMS). Use when the user asks to create, generate, animate, or make a video, clip, animation, or motion shot — including text-to-video and image-to-video.
---

# Generate videos with AI Media Studio (AIMS)

Create videos via the AIMS API. **Prefer the first available method:**

1. **MCP tool** `generate_video` — if the `aims` MCP server is connected. Pass `prompt` plus any of `model`, `duration`, `aspect_ratio`, `audio`, `image_url`, `image_urls`, `resolution`, `negative_prompt`, `make_public`. Returns JSON (`url`, `credits_used`).
2. **CLI** `aims video "<prompt>" --duration 6 --json` — if the `aims` CLI is installed (`aims login --key` or `AIMS_API_KEY`). Never run `aims login` without `--key`.
3. **HTTP** — `POST https://app.ai-media-studio.com/api/v1/videos/generate` with `Authorization: Bearer $AIMS_API_KEY`.

## Inputs to gather

- **prompt** (required): describe the scene, motion, camera movement, and mood.
- **model** (optional): see recommended models below.
- **duration** (optional): seconds. The API snaps to the model's nearest supported value.
- **aspect_ratio** (optional): `16:9` (landscape) or `9:16` (vertical/social).
- **audio** (optional): enable generated audio when the model supports it.
- **image_url** (optional): a source image for **image-to-video** models.
- **image_urls** (optional): reference image URLs for **reference-to-video** models.
- **resolution** (optional): output resolution when supported (e.g. `720p`, `1080p`).
- **negative_prompt** (optional): elements to avoid, when the model supports it.
- **make_public** (optional): make the result publicly shareable (returns a `share_url`).

## Recommended models (credits are charged PER SECOND)

- `fal-ai/veo3.1/fast` — strong, well-rounded (30/s). **Good default.**
- `fal-ai/veo3.1/lite` — cheaper (15/s).
- `bytedance/seedance-2.0/fast/text-to-video` — fast and economical (20/s).
- `fal-ai/sora-2/text-to-video` — Sora 2 (35/s).
- `fal-ai/kling-video/v3/standard/text-to-video` — Kling v3 (67/s).

For image-to-video, use an `…/image-to-video` model id and pass `image_url`. Discover live models with the `list_models` MCP tool, `aims models --type video`, or `GET /api/v1/videos/generate`.

> Cost note: a 5-second clip on `fal-ai/veo3.1/fast` costs ~150 credits (30/s × 5s). Confirm with the user before generating long or expensive clips.

## Steps

1. Build a strong prompt (subject, motion, camera, lighting, mood).
2. Pick a model and a sensible `duration`. Default to `fal-ai/veo3.1/fast`.
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
    "model": "fal-ai/veo3.1/fast",
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
    "model": "fal-ai/veo3.1/fast/image-to-video",
    "duration": 5,
    "image_url": "https://example.com/keyframe.png"
  }'
```

## CLI example

```bash
aims video "a timelapse of clouds over a city skyline" -m fal-ai/veo3.1/fast -d 6 -a 16:9 --json
```

## Notes

- The response `video.url` is a direct, hosted MP4 URL.
- Set `make_public: true` for a public `share_url`.
- Credits are refunded automatically if generation fails.
