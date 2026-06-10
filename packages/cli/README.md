# @ai-media-studio/cli

Command-line tool to generate images and videos with [AI Media Studio (AIMS)](https://app.ai-media-studio.com).

## Install

```bash
npm install -g @ai-media-studio/cli
```

## Authenticate

```bash
aims login      # paste your aims_ API key (from AIMS → Workspace Settings → API Keys)
```

The key is saved to `~/.aims/config.json` (mode `600`). You can also set `AIMS_API_KEY` or pass `--key`.

## Usage

```bash
# Account / discovery
aims whoami
aims models --type image

# Images
aims image "a red panda astronaut, studio lighting" -m fal-ai/nano-banana-2 -a 16:9 --output ./out
aims image "logo of a mountain, flat vector" -a 1:1 -n 4

# Image-to-image editing
aims edit "make it a night scene with neon" --image-url https://example.com/photo.jpg --output ./out

# Videos (credits are per second)
aims video "drone shot over snowy mountains at sunrise" -m fal-ai/veo3.1/fast -d 6 -a 16:9 --output ./out
```

### Global flags

- `--key <key>` — API key (overrides env/config)
- `--base-url <url>` — API base URL (default `https://app.ai-media-studio.com/api/v1`)
- `--json` — print raw JSON responses

Run `aims --help` or `aims <command> --help` for all options.

## Prefer agents over a shell?

`@ai-media-studio/cli` and the [`@ai-media-studio/mcp`](https://www.npmjs.com/package/@ai-media-studio/mcp) MCP server share the same client and the same API key. Install `@ai-media-studio/mcp` to call the exact same generation tools from Claude Code, Cursor, or Claude Desktop.

Apache-2.0
