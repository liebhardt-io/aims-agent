# Authentication

All AIMS API requests are authenticated with an **API key** tied to a workspace.

## Get an API key

1. Sign in to AI Media Studio at <https://app.ai-media-studio.com>.
2. Open **Workspace Settings → API Keys**.
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
| MCP server (`@aims/mcp`) | `AIMS_API_KEY` env var (set via `claude mcp add -e AIMS_API_KEY=…`) |
| CLI (`@aims/cli`) | `aims login` (saved to `~/.aims/config.json`, mode `600`), or `AIMS_API_KEY`, or `--key` |
| Direct HTTP | `Authorization` / `X-API-Key` header you set |

Override the API base URL with `AIMS_BASE_URL` (default `https://app.ai-media-studio.com/api/v1`).

## Verify a key

```bash
curl https://app.ai-media-studio.com/api/v1/images/generate \
  -H "Authorization: Bearer $AIMS_API_KEY"
```

Returns workspace id, credit balance, scopes, and available image models.

## Security

- **Never commit API keys** or expose them in client-side code.
- The CLI stores the key locally at `~/.aims/config.json` with `600` permissions. Run `aims logout` to remove it.
- Rotate keys from the dashboard if one is leaked.
