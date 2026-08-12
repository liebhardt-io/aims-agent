# AGENTS.md

How coding agents should use AI Media Studio (AIMS) from this repo.

## Prefer non-interactive flags

Never wait for a prompt. Pass every input as a flag or env var.

```bash
aims login --key "$AIMS_API_KEY"
aims whoami --json
aims models --type image --json
aims image "a red panda astronaut, studio lighting" --aspect-ratio 16:9 --json
aims video "drone shot over snowy mountains" --duration 6 --json
```

Missing key? Fail and show the user:

```text
aims login --key <aims_key>
export AIMS_API_KEY=<aims_key>
```

Do not run `aims login` without `--key` (it only prompts when stdin is a TTY).

## Discover incrementally

```bash
aims --help
aims image --help
aims-mcp --help
aims-mcp --list-tools
```

Every `--help` includes copy-pasteable Examples.

## JSON and pipes

- `--json` (or `AIMS_OUTPUT=json`) prints machine-readable JSON on stdout.
- `--print url` prints only result URL(s), one per line — for chaining.
- Progress goes to stderr. `--quiet` silences it.
- `--stdin` reads the prompt from stdin. `-` as the prompt does the same.
- `--dry-run` prints the request body and exits 0 without spending credits.

```bash
echo "a red panda astronaut" | aims image --stdin --json
url=$(aims image "a red panda astronaut" --print url)
aims video "slow cinematic push-in" --image-url "$url" --duration 5 --json
```

## MCP

Stdio server: `aims-mcp`. Register with `AIMS_API_KEY` (or a prior `aims login --key`).

Tools return JSON: `url`, `id`, `credits_used`, `credits_remaining`.

1. `get_account` if you need credits/scopes.
2. `list_models` to pick a live model id.
3. `generate_image` / `edit_image` / `generate_video`.
4. Return hosted URLs and credit usage to the user.

Defaults: `fal-ai/nano-banana-2` (images), `fal-ai/veo3.1/fast` (video). Video credits are per second.

## Idempotency and cost

- `aims login --key` is safe to retry (overwrites `~/.aims/config.json`).
- Generation is **not** idempotent — each call spends credits. Use `--dry-run` to preview.
- `aims logout --yes` skips the confirmation (non-TTY already skips it).
