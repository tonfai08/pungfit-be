# PungFit MCP

The MCP endpoint runs inside the existing Express backend at `POST /mcp`.

## Connect a user

1. Sign in to PungFit normally.
2. Create an access key from Profile, or call:

```http
POST /v1/users/me/mcp-access-key
Authorization: Bearer <normal-login-token>
```

The response contains `access_key` once. Creating a new key revokes the old
key. Only its SHA-256 hash is stored in MongoDB.

3. Configure the MCP client:

```text
URL: https://api.pungfit.life/mcp
Authorization: Bearer pungfit_pat_...
```

For Codex, store the key in `PUNGFIT_MCP_TOKEN` and configure:

```toml
[mcp_servers.pungfit]
url = "https://api.pungfit.life/mcp"
bearer_token_env_var = "PUNGFIT_MCP_TOKEN"
default_tools_approval_mode = "writes"
```

Never paste an access key into chat, logs, source control, or screenshots.

## Revoke access

```http
DELETE /v1/users/me/mcp-access-key
Authorization: Bearer <normal-login-token>
```

## Tools

- `record_workout` requires `workout:write`.
- `get_today_workouts` requires `workout:read`.

Normal API and MCP authentication remain separate. An MCP access key can only
be used on `/mcp`.
