# Authentication

All AIMS API requests are authenticated with an **API key** tied to a workspace.

## Browser login and hosted MCP

```bash
aims login                      # interactive browser approval
aims login --web --no-browser   # explicit opt-in without a TTY; open the printed URL
aims login --paste              # prior interactive key-paste path
aims login --key aims_xxx       # manual key / automation
```

Command-local `--key`, global `--key`, and `AIMS_API_KEY` take priority in that order. Interactive no-key login defaults to the browser; non-TTY no-key login refuses unless `--web` is supplied. `--no-browser` suppresses automatic opening, not the printed approval URL. Browser login discovers OAuth endpoints at the API base URL's origin, registers a public client, and uses an authorization code with S256 PKCE and random state. Its ephemeral `127.0.0.1` callback expires after five minutes. The CLI validates the returned key with `get_account` before saving; cancellation, wrong state, and failures do not overwrite saved config or print the token.

The hosted MCP endpoint is **https://app.ai-media-studio.com/mcp**. An OAuth-capable MCP client handles browser approval and stores its own credential; no `AIMS_API_KEY` environment variable is needed. See [MCP configuration](../packages/mcp/README.md), including VS Code's `servers` format versus Claude's `mcpServers`.

**Approval requires a workspace owner/admin.** Browser-created CLI and MCP connections are ordinary workspace API keys with workspace scopes and credits, not separate OAuth grants to manage. View and revoke all connections under **Workspace Settings → API** (API Keys).

## Get an API key

1. Sign in to AI Media Studio at <https://app.ai-media-studio.com>.
2. Open **Workspace Settings → API** (API Keys) as a workspace owner/admin.
3. Create a key. It looks like `aims_xxxxxxxxxxxxxxxxxxxxxxxx`. Copy it now — it is shown only once.

API keys are bound to a **workspace**, so every key shares that workspace's credit pool. Keys carry **scopes** (e.g. `image:generate`, `video:generate`, `media:read`, `media:write`) and a per-minute rate limit (default 60 req/min).

## Use the key

Send it on every request using either header:

```http
Authorization: Bearer aims_xxxxxxxxxxxxxxxxxxxxxxxx
```

or

```http
X-API-Key: aims_xxxxxxxxxxxxxxxxxxxxxxxx
```

## Where each tool reads the key

| Surface | How it gets the key |
| --- | --- |
| Hosted MCP (`https://app.ai-media-studio.com/mcp`) | Browser approval; the MCP client stores the workspace key |
| Local stdio MCP (`@ai-media-studio/mcp`) | `AIMS_API_KEY` env var or CLI's saved `~/.aims/config.json` |
| CLI (`@ai-media-studio/cli`) | `--key` > `AIMS_API_KEY` > saved config; `aims login` saves a validated browser/manual key with mode `600` |
| Direct HTTP | `Authorization` / `X-API-Key` header you set |

Override the API base URL with `AIMS_BASE_URL` (default `https://app.ai-media-studio.com/api/v1`; `AIMS_API_BASE_URL` is accepted as an alias).

## Verify a key

```bash
curl https://app.ai-media-studio.com/api/v1/images/generate \
  -H "Authorization: Bearer $AIMS_API_KEY"
```

Returns workspace id, credit balance, scopes, and available image models.

## Security

- **Never commit API keys** or expose them in client-side code.
- The CLI stores the key locally at `~/.aims/config.json` with `600` permissions. Run `aims logout` to remove it locally; this does not revoke server access.
- Revoke connections or rotate leaked keys under **Workspace Settings → API**. Hosted MCP clients manage their local copies independently.
