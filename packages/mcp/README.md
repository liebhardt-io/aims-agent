# @aims/mcp

MCP server for [AI Media Studio (AIMS)](https://app.ai-media-studio.com). Generate and edit images and videos from any MCP-compatible agent — Claude Code, Cursor, or Claude Desktop.

## Install (Claude Code)

```bash
claude mcp add aims -e AIMS_API_KEY=aims_xxx -- npx -y -p @aims/mcp@latest aims-mcp
```

Then restart Claude Code. Get an API key in AIMS → **Workspace Settings → API Keys**.

## Manual config (`.mcp.json` / Claude Desktop)

```json
{
  "mcpServers": {
    "aims": {
      "command": "npx",
      "args": ["-y", "-p", "@aims/mcp@latest", "aims-mcp"],
      "env": { "AIMS_API_KEY": "aims_xxx" }
    }
  }
}
```

## Tools

| Tool | Description |
| --- | --- |
| `generate_image` | Text-to-image (and image-to-image via `image_urls`). |
| `edit_image` | Image-to-image editing from source URL(s). |
| `generate_video` | Text-to-video and image-to-video. |
| `list_models` | Discover available image/video models and costs. |
| `get_account` | Workspace id, credit balance, and scopes. |

## Environment

- `AIMS_API_KEY` (required) — your `aims_` key.
- `AIMS_BASE_URL` (optional) — defaults to `https://app.ai-media-studio.com/api/v1`.

## Try it

> "Use aims to make a 16:9 image of a red panda astronaut, then make a 6-second video panning across it."

Apache-2.0
