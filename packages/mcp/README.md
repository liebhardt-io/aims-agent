# @ai-media-studio/mcp

MCP server for [AI Media Studio (AIMS)](https://app.ai-media-studio.com). Generate and edit images and videos from Claude Code, Cursor, Codex, Claude Desktop, or any MCP client.

The binary speaks MCP over **stdio**. It also has a non-interactive discovery path so agents can inspect it without starting the protocol:

```bash
aims-mcp --help
aims-mcp --list-tools
```

## Install (Claude Code)

```bash
claude mcp add aims -e AIMS_API_KEY=aims_xxx -- npx -y -p @ai-media-studio/mcp@latest aims-mcp
```

Then restart Claude Code. Get an API key in AIMS → **Workspace Settings → API Keys**.

If you already ran `aims login --key`, the server will also read `~/.aims/config.json`.

## Manual config (`.mcp.json` / Claude Desktop / Cursor)

```json
{
  "mcpServers": {
    "aims": {
      "command": "npx",
      "args": ["-y", "-p", "@ai-media-studio/mcp@latest", "aims-mcp"],
      "env": { "AIMS_API_KEY": "aims_xxx" }
    }
  }
}
```

## Tools

All tools return JSON (`url`, `id`, `credits_used`, `credits_remaining`). Read-only tools are annotated as such.

| Tool | Description |
| --- | --- |
| `upload_image` | Upload supplied `image_base64` contents, up to 20 MiB. Requires `media:write`. Reads no local files. |
| `generate_image` | Text-to-image (and image-to-image via `image_urls`). |
| `edit_image` | Image-to-image editing from source URL(s). |
| `generate_video` | Text, image, reference, first/last-frame, and extended video generation. |
| `list_models` | Discover available image/video models and costs (read-only). |
| `get_account` | Workspace id, credit balance, and scopes (read-only). |

Suggested order: `get_account` → `list_models` → generate. Defaults: `fal-ai/nano-banana-2` (images), `fal-ai/veo3.1/fast` (video). Video credits are per second.

For supplied image contents, call `upload_image` with raw `image_base64` and an optional `filename`, then pass the returned workspace URL to `edit_image` or `generate_video`. PNG, JPEG, WebP, GIF, AVIF, HEIC, and BMP are supported. Raster signatures are checked before any HTTP upload. For local files, run `aims upload ./photo.png --print url` and use that URL with MCP. Filesystem paths are not accepted by `upload_image`.

For first/last-frame models, provide `first_frame_url` and `last_frame_url`. For extension models, provide `extend_video_url` from a video generated in the same workspace. Reference models accept `image_urls`.

Partial and total image failures return `isError: true` with the complete JSON result, including any completed images. Preserve those completed results and retry only the missing work. The server never retries paid generations automatically.

## Environment

- `AIMS_API_KEY` (required unless `aims login --key` was used) — your `aims_` key.
- `AIMS_BASE_URL` (optional) — defaults to `https://app.ai-media-studio.com/api/v1`.

## Try it

> "Use aims to make a 16:9 image of a red panda astronaut, then make a 6-second video panning across it."

Apache-2.0
