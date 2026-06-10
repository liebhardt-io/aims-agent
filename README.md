# aims-agent

**Generate images and videos with AI agents.** `aims-agent` makes [AI Media Studio (AIMS)](https://app.ai-media-studio.com) available to Claude Code, Cursor, Claude Desktop, and any MCP or HTTP agent — through an **MCP server**, a **CLI**, and **Agent Skills**, all backed by the same API key.

> Turn a prompt into a finished image or video, right from your agent:
> *"Make a 16:9 image of a red panda astronaut, then a 6-second video panning across it."*

- 🧩 **MCP server** — `@aims/mcp`, runnable with `npx`
- 🖥️ **CLI** — `@aims/cli`, the `aims` command
- 🛠️ **Skills** — drop-in Claude Code skills for generating & editing media
- 🔌 **Plain HTTP** — it's just `POST /api/v1/...` with a Bearer token

Everything authenticates with one `aims_` API key from **AIMS → Workspace Settings → API Keys**.

---

## Quick start

Pick whichever fits your agent. They all use the same key and the same models.

### 1. Skills (one-liner)

Pull every AIMS skill into your agent:

```bash
npx skills add liebhardt-io/aims-agent
```

Then just ask in natural language: *"Make a 1:1 image of a minimalist mountain logo with AIMS."*

### 2. Claude Code plugin (skills + MCP together)

```bash
claude plugin marketplace add liebhardt-io/aims-agent
claude plugin install aims@aims
```

This installs the skills **and** registers the `aims` MCP server. Set `AIMS_API_KEY` in your environment first.

### 3. MCP server

```bash
claude mcp add aims -e AIMS_API_KEY=aims_xxx -- npx -y -p @aims/mcp@latest aims-mcp
```

Restart Claude Code, then: *"Use aims to generate a video of waves at sunset."* See [`packages/mcp`](packages/mcp/README.md).

### 4. CLI

```bash
npm install -g @aims/cli
aims login
aims image "a red panda astronaut, studio lighting" -a 16:9 --output ./out
aims video "drone shot over snowy mountains at sunrise" -d 6 --output ./out
```

See [`packages/cli`](packages/cli/README.md).

### 5. Plain HTTP

```bash
curl -X POST https://app.ai-media-studio.com/api/v1/images/generate \
  -H "Authorization: Bearer $AIMS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "prompt": "a serene japanese garden in autumn", "model": "fal-ai/nano-banana-2", "aspect_ratio": "16:9" }'
```

Full reference: [`reference/api.md`](reference/api.md).

---

## What's in here

```
aims-agent/
├── packages/
│   ├── core/        @aims/core — shared API client + types
│   ├── mcp/         @aims/mcp  — MCP server (bin: aims-mcp)
│   └── cli/         @aims/cli  — CLI (bin: aims)
├── skills/          Agent Skills (generate image / generate video / edit image)
├── reference/       api.md · authentication.md · models.md · prompting.md
├── .claude-plugin/  plugin.json + marketplace.json (Claude Code plugin)
└── .mcp.json        project-scoped MCP config
```

## Capabilities

| | MCP tool | CLI | HTTP |
| --- | --- | --- | --- |
| Text-to-image | `generate_image` | `aims image` | `POST /images/generate` |
| Image-to-image edit | `edit_image` | `aims edit` | `POST /images/generate` + `image_urls` |
| Text/image-to-video | `generate_video` | `aims video` | `POST /videos/generate` |
| List models | `list_models` | `aims models` | `GET /models` |
| Account & credits | `get_account` | `aims whoami` | `GET /images/generate` |

> **Note:** Image-to-video and reference-to-video use dedicated model ids (e.g. `fal-ai/veo3.1/fast/image-to-video`). Pass `image_url` (or `image_urls`) together with that model id. Use `list_models` / `aims models` / `GET /models` to discover them.

Discover live models and pricing any time — see [`reference/models.md`](reference/models.md). Prompting tips in [`reference/prompting.md`](reference/prompting.md).

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `AIMS_API_KEY` | — | Your `aims_` key (required). |
| `AIMS_BASE_URL` | `https://app.ai-media-studio.com/api/v1` | Override the API base URL. |

The CLI also persists the key at `~/.aims/config.json` (mode `600`) via `aims login`.

## Develop

```bash
pnpm install
pnpm build        # builds core → mcp → cli (topological order)
pnpm typecheck

# run locally
AIMS_API_KEY=aims_xxx node packages/mcp/dist/index.js   # MCP server (stdio)
node packages/cli/dist/index.js whoami                  # CLI
```

## Publishing

The packages depend on `@aims/core`, so publish in order:

```bash
cd packages/core && npm publish --access public
cd ../mcp && npm publish --access public
cd ../cli && npm publish --access public
```

Until published to npm, the GitHub-based installs (`npx skills add …`, `claude plugin marketplace add …`) work directly from this repo.

## License

[Apache-2.0](LICENSE)
