# @ai-media-studio/mcp

MCP server for [AI Media Studio (AIMS)](https://app.ai-media-studio.com). Generate and edit images and videos from Claude Code, Cursor, Codex, Claude Desktop, or any MCP client.

## Hosted MCP (recommended)

Connect to **https://app.ai-media-studio.com/mcp** over HTTP. Your OAuth-capable client opens browser approval; no local Node process or `AIMS_API_KEY` environment variable is needed. A workspace **owner/admin** must approve the connection. Hosted MCP, CLI browser login, and manual keys all use ordinary workspace API keys sharing workspace credits and scopes. Revoke any connection under **Workspace Settings → API** (API Keys).

### Claude Code

```bash
claude mcp add --transport http aims https://app.ai-media-studio.com/mcp
```

Use `/mcp` to authenticate. Alternatively, install the Claude Code plugin (skills plus hosted MCP):

```bash
claude plugin marketplace add liebhardt-io/aims-agent
claude plugin install aims@aims
```

### Claude Code `.mcp.json`

```json
{
  "mcpServers": {
    "aims": {
      "type": "http",
      "url": "https://app.ai-media-studio.com/mcp"
    }
  }
}
```

Other OAuth-capable clients can add the same URL through their remote-server settings. Client configuration formats differ; do not assume Claude's JSON works everywhere.

### VS Code `.vscode/mcp.json`

VS Code uses **`servers`**, not `mcpServers`:

```json
{
  "servers": {
    "aims": {
      "type": "http",
      "url": "https://app.ai-media-studio.com/mcp"
    }
  }
}
```

Start the server and follow the client's browser authentication prompt. Hosted credentials are stored by the client independently of CLI config.

## Optional local stdio server

For clients without hosted OAuth support, the npm binary speaks MCP over **stdio**. It also has a non-interactive discovery path so agents can inspect it without starting the protocol:

```bash
npx -y @ai-media-studio/mcp --help
npx -y @ai-media-studio/mcp --list-tools
```

### Install (Claude Code, local stdio)

```bash
claude mcp add aims -e AIMS_API_KEY=aims_xxx -- npx -y @ai-media-studio/mcp
```

Then restart Claude Code. Create a manual API key in AIMS → **Workspace Settings → API** (API Keys).

If you already ran CLI browser login (`aims login`) or `aims login --key`, the server also reads `~/.aims/config.json`; you may omit `-e` in that case. CLI non-TTY browser login requires `aims login --web`, `--no-browser` prints the URL without opening it, and `--paste` keeps the old interactive prompt. Local `aims logout` removes saved credentials only, not the server-side key.

### Manual local config (Claude-style `mcpServers`)

```json
{
  "mcpServers": {
    "aims": {
      "command": "npx",
      "args": ["-y", "@ai-media-studio/mcp"],
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

## Environment (local stdio only)

- `AIMS_API_KEY` (required unless CLI browser/manual login saved a key) — your `aims_` key.
- `AIMS_BASE_URL` (optional) — defaults to `https://app.ai-media-studio.com/api/v1`. `AIMS_API_BASE_URL` is accepted as an alias.

## Try it

> "Use aims to make a 16:9 image of a red panda astronaut, then make a 6-second video panning across it."

Apache-2.0
