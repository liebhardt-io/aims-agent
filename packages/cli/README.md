# @ai-media-studio/cli

Command-line tool to generate images and videos with [AI Media Studio (AIMS)](https://app.ai-media-studio.com). Built for humans **and** coding agents: every input is a flag, `--help` includes examples, stdout is machine-useful.

## Install

```bash
npm install -g @ai-media-studio/cli
```

## Authenticate

```bash
aims login                       # interactive: opens the browser
aims login --web --no-browser    # explicit browser login; print URL only
aims login --paste               # interactive: paste an existing key
aims login --key aims_xxx        # non-interactive / automation
```

Browser login asks you to sign in and select a workspace. Approval requires a workspace **owner/admin** and creates an ordinary workspace API key, not a separate kind of credential. All CLI and hosted MCP connections can be revoked under **Workspace Settings → API** (API Keys), and share the workspace's credits and key scopes.

The CLI validates the key with `get_account` before saving it to `~/.aims/config.json` (mode `600`); the token is never printed. Command-local `--key`, global `--key`, then `AIMS_API_KEY` take priority over browser login. Other commands also read the saved key. `aims logout` deletes the local credential only; revoke it in Workspace Settings to remove server access.

If no explicit/environment key is available, interactive login defaults to the browser. Without a TTY, login exits immediately unless `--web` is supplied; `--paste` requires a TTY. `--no-browser` disables automatic opening but still prints the approval URL to stderr. Open it in a browser on the same machine as the CLI (or forward its loopback callback when using a remote machine). A random state and S256 PKCE protect the authorization-code flow; the callback binds to an ephemeral `127.0.0.1` port and times out after five minutes. Cancellation, incorrect state, or failed exchange/validation leaves saved config unchanged.

Discovery uses `/.well-known/oauth-authorization-server` on the origin of the resolved API base URL (`--base-url`, environment, saved config, then production).

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
source_url=$(aims upload ./photo.jpg --print url) &&
  aims edit "make it a night scene with neon" --image-url "$source_url" --json

# Videos (credits are per second)
aims video "drone shot over snowy mountains at sunrise" -m fal-ai/veo3.1/fast -d 6 --json

# First/last frames, using URLs uploaded to this workspace
aims video "transition between scenes" -m fal-ai/veo3.1/fast/first-last-frame-to-video \
  --first-frame-url "$START_URL" --last-frame-url "$END_URL" --json

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

`aims upload <file>` accepts PNG, JPEG, WebP, GIF, AVIF, HEIC, and BMP files up to 20 MiB and requires `media:write`. Use the returned workspace URL as an image reference. Arbitrary external image URLs are not accepted.

For reference-to-video models, repeat `--image-urls <url>` for each reference. First/last-frame models require `--first-frame-url` and `--last-frame-url`. Extension models use `--extend-video-url` with a video previously generated in the same workspace.

## Agent notes

- Progress messages go to **stderr**. stdout is the result.
- Exit `2` means usage error (missing flags); exit `1` means API/runtime error.
- Partial and total image failures exit `1` after printing the result. JSON retains per-image errors and completed URLs; `--print url` retains completed URLs. Check the exit code before chaining another generation.
- Download failures exit `1` while preserving the generation result, `saved` paths, and `download_errors` in JSON. Retry the download using its URL instead of regenerating paid media.
- `aims login --key` is idempotent. Generation is not — use `--dry-run` first if unsure.
- Chain successful results with `--print url`: `url=$(aims image "mountains" --print url) && aims video "pan across" --model fal-ai/veo3.1/fast/image-to-video --image-url "$url" --json`

## Prefer MCP?

Connect your MCP client to **https://app.ai-media-studio.com/mcp** and approve access in the browser; no API-key environment variable is needed. See the [MCP README](https://github.com/liebhardt-io/aims-agent/blob/main/packages/mcp/README.md) for client-specific configuration. The optional local [`@ai-media-studio/mcp`](https://www.npmjs.com/package/@ai-media-studio/mcp) stdio server shares the CLI's saved key or `AIMS_API_KEY`.

Apache-2.0
