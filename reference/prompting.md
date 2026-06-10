# Prompting tips

Good prompts make the biggest difference. Be specific and structured.

## Images

Cover these dimensions in roughly this order:

1. **Subject** — what it is ("a red panda astronaut").
2. **Action / pose** — what it's doing.
3. **Setting** — where it is ("floating in a nebula").
4. **Style** — "photorealistic", "flat vector", "watercolor", "3D render", "anime".
5. **Composition** — "close-up", "wide shot", "rule of thirds", "centered".
6. **Lighting & mood** — "soft studio lighting", "golden hour", "moody, cinematic".
7. **Quality cues** — "highly detailed", "sharp focus".

Example:

> a flat vector logo of a mountain peak, minimal, two-tone teal and white, centered, on a transparent background

Tips:
- For crisp **text/typography** in an image, prefer `openai/gpt-image-2`.
- Use `aspect_ratio` to control framing (`1:1` icons/logos, `16:9` banners, `9:16` phone wallpapers/social).
- Generate `n: 2–4` variations when exploring a concept.
- Use a fixed `seed` to reproduce or iterate on a specific result.

## Image editing (image-to-image)

State the change explicitly and only the change:

> turn this into a moody night scene with neon reflections, keep the composition

- Pass 1 image to transform it; pass several `image_urls` to combine them.
- `aspect_ratio` defaults to `auto` to preserve the original proportions.

## Videos

Describe **motion** and **camera** in addition to the scene:

> a cinematic drone shot slowly flying over snowy mountains at sunrise, gentle push-in, volumetric light, 16:9

- Keep clips short to control cost (credits are per second).
- For image-to-video, write the prompt as the *motion* you want applied to the still image.
- Add `audio: true` only on models that support it.
