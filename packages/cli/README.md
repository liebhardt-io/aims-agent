# @ai-media-studio/cli

Command-line tool to generate images and videos with [AI Media Studio (AIMS)](https://app.ai-media-studio.com). Built for humans **and** coding agents: every input is a flag, `--help` includes examples, stdout is machine-useful.

## Install

```bash
npm install -g @ai-media-studio/cli
```

## Authenticate

```bash
aims login --key aims_xxx
```

The key is saved to `~/.aims/config.json` (mode `600`). You can also set `AIMS_API_KEY` or pass `--key` on any command.

If `--key` / `AIMS_API_KEY` is missing and stdin is not a TTY, `aims login` exits immediately with an example — it will not hang.

## Usage

```bash
# Account / discovery
aims whoami --json
aims models --type image --json
aims config path

# Images
aims image "a red panda astronaut, studio lighting" -m fal-ai/nano-banana-2 -a 16:9 --json
aims image "logo of a mountain, flat vector" -a 1:1 --output ./out
echo "a red panda astronaut" | aims image --stdin --json

# Image-to-image editing
aims edit "make it a night scene with neon" --image-url https://example.com/photo.jpg --json

# Videos (credits are per second)
aims video "drone shot over snowy mountains at sunrise" -m fal-ai/veo3.1/fast -d 6 --json

# Preview without spending credits
aims image "a red panda astronaut" --dry-run --json
```

### Global flags

- `--key <key>` — API key (overrides env/config)
- `--base-url <url>` — API base URL (default `https://app.ai-media-studio.com/api/v1`)
- `--json` — print JSON (same as `--print json`)
- `--print text|json|url` — `url` prints result URL(s) only, one per line
- `--quiet` — suppress progress on stderr

`AIMS_OUTPUT=json` is equivalent to `--json`.

Run `aims --help` or `aims <command> --help` for examples.

## Agent notes

- Progress messages go to **stderr**. stdout is the result.
- Exit `2` means usage error (missing flags); exit `1` means API/runtime error.
- `aims login --key` is idempotent. Generation is not — use `--dry-run` first if unsure.
- Chain with `--print url`: `aims video "pan across" --image-url "$(aims image "…" --print url)" --json`

## Prefer MCP?

`@ai-media-studio/cli` and [`@ai-media-studio/mcp`](https://www.npmjs.com/package/@ai-media-studio/mcp) share the same client and API key.

Apache-2.0
