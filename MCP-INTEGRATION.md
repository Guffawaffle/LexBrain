# LexBrain MCP Integration Guide

LexBrain is a **self-contained MCP (Model Context Protocol) server** - no separate HTTP server needed! Just like `@modelcontextprotocol/server-memory`, it works out of the box.

## Quick Setup for VS Code / GitHub Copilot

Add to your `~/.config/Code/User/settings.json` (or Windows equivalent):

```jsonc
{
  "github.copilot.chat.mcp.servers": {
    "lexbrain": {
      "command": "wsl",
      "args": ["--", "/srv/lex-mcp/lex-brain/mcp-server.mjs"],
      "env": {
        "LEXBRAIN_DB": "/srv/lex-mcp/lex-brain/thoughts.db",
        "LEXBRAIN_MODE": "local"
      }
    }
  }
}
```

**For native Linux/Mac** (no WSL needed):
```jsonc
{
  "github.copilot.chat.mcp.servers": {
    "lexbrain": {
      "command": "node",
      "args": ["/srv/lex-mcp/lex-brain/mcp-server.mjs"],
      "env": {
        "LEXBRAIN_DB": "/srv/lex-mcp/lex-brain/thoughts.db",
        "LEXBRAIN_MODE": "local"
      }
    }
  }
}
```

## Quick Setup for Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (Mac) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "lexbrain": {
      "command": "node",
      "args": ["/srv/lex-mcp/lex-brain/mcp-server.mjs"],
      "env": {
        "LEXBRAIN_DB": "/srv/lex-mcp/lex-brain/thoughts.db",
        "LEXBRAIN_MODE": "local"
      }
    }
  }
}
```

That's it! The MCP server handles everything - database initialization, storage, querying - all self-contained.

## Available Tools

- **thought_put**: Store facts in the knowledge base
- **thought_get**: Query facts from the knowledge base
- **thought_lock**: Acquire advisory locks
- **thought_unlock**: Release advisory locks
- **lexmap_get_atlas_frame**: Get structural neighborhood data for modules from LexMap policy

## Configuration

Environment variables (all optional):

```bash
# Database location
export LEXBRAIN_DB=./thoughts.db          # Default: ./thoughts.db

# Security mode
export LEXBRAIN_MODE=local                # 'local' or 'zk' (default: local)
export LEXBRAIN_KEY_HEX=abc123def...      # Required if LEXBRAIN_MODE=zk (64 hex chars)

# Retention & limits
export LEXBRAIN_TTL_DAYS=7                # Default TTL in days (default: 7)
export LEXBRAIN_MAX_PAYLOAD_KB=256        # Max payload size (default: 256KB)
```

**No HTTP server needed!** Everything runs in-process with SQLite.

## Tool Reference

### thought.put

Store a fact in the knowledge base.

**Input:**
```json
{
  "kind": "repo_scan",
  "scope": {
    "repo": "my-repo",
    "commit": "abc123",
    "path": "src/main.ts",
    "symbol": "MyClass"
  },
  "inputs_hash": "h1a2b3c",
  "payload": {"files": ["src/main.ts"]},
  "ttl_seconds": 86400
}
```

**Output:**
```json
{
  "fact_id": "04295afbc06de0cf...",
  "inserted": true
}
```

### thought.get

Query facts from the knowledge base.

**Input:**
```json
{
  "repo": "my-repo",
  "commit": "abc123",
  "kind": "repo_scan",
  "inputs_hash": "h1a2b3c"
}
```

**Output:**
```json
[
  {
    "fact_id": "04295afbc06de0cf...",
    "kind": "repo_scan",
    "scope": {...},
    "payload": {...},
    "ts": "2025-11-01T...",
    "ttl_seconds": 86400
  }
]
```

### thought.lock

Acquire an advisory lock.

**Input:**
```json
{
  "name": "my-critical-operation"
}
```

**Output:**
```json
{
  "ok": true
}
```

### thought.unlock

Release an advisory lock.

**Input:**
```json
{
  "name": "my-critical-operation"
}
```

**Output:**
```json
{
  "ok": true
}
```

### lexmap.get_atlas_frame

Get structural neighborhood data for modules from LexMap policy. Returns an Atlas Frame data blob containing modules within a specified fold-radius from seed modules.

**Input:**
```json
{
  "module_scope": ["ui/user-admin-panel"],
  "fold_radius": 1
}
```

**Output:**
```json
{
  "atlas_timestamp": "2025-11-02T05:55:20.680Z",
  "seed_modules": ["ui/user-admin-panel"],
  "fold_radius": 1,
  "modules": [
    {
      "id": "ui/user-admin-panel",
      "coords": [0, 2],
      "allowed_callers": [],
      "forbidden_callers": ["services/auth-core"],
      "feature_flags": ["beta_user_admin"],
      "requires_permissions": ["can_manage_users"],
      "kill_patterns": ["duplicate_auth_logic"]
    },
    {
      "id": "services/user-access-api",
      "coords": [1, 2],
      "allowed_callers": ["ui/user-admin-panel", "ui/admin-dashboard"],
      "forbidden_callers": [],
      "feature_flags": ["beta_user_admin"],
      "requires_permissions": ["can_manage_users"],
      "kill_patterns": []
    }
  ],
  "critical_rule": "Every module name MUST match the IDs in lexmap.policy.json. No ad hoc naming."
}
```

**Parameters:**
- `module_scope` (required): Array of seed module IDs from `lexmap.policy.json`
- `fold_radius` (optional, default: 1): Number of hops to expand from seed modules

**Use Cases:**
- Generate visual context cards showing module relationships
- Understand architectural neighborhoods around specific modules
- Validate allowed/forbidden caller relationships
- Export structural data for Atlas Frame storage

## Architecture

```
Claude (or any MCP client)
    ↓
.vscode/settings.json (MCP server config)
    ↓
mcp-server.mjs (Protocol wrapper)
    ↓
HTTP requests
    ↓
LexBrain Server (packages/server)
    ↓
SQLite Database (./thoughts.db)
```

## Examples

### Store analysis results with encryption

```bash
LEXBRAIN_MODE=zk \
LEXBRAIN_KEY_HEX=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef \
node mcp-server.mjs
```

### Query facts from Claude

In any Claude conversation while working in this folder, you can:

```
Use the thought.get tool to find all repo_scan facts for commit abc123 in my-repo.
```

Claude will automatically translate this to:
```json
{
  "repo": "my-repo",
  "commit": "abc123",
  "kind": "repo_scan"
}
```

### Coordinate work with locks

```
Acquire a lock named "analysis-in-progress" before starting analysis,
then release it when complete.
```

### Get module neighborhood from LexMap

```
Use lexmap.get_atlas_frame to show me the structural neighborhood around 
"ui/user-admin-panel" with a fold radius of 2.
```

Claude will automatically translate this to:
```json
{
  "module_scope": ["ui/user-admin-panel"],
  "fold_radius": 2
}
```

This returns all modules within 2 hops of the seed module, including their coordinates, allowed/forbidden callers, and policy constraints.

## Performance

- **GET latency:** p95 ≤ 50ms
- **PUT latency:** p95 ≤ 200ms
- **Lock operations:** < 10ms

See `/metrics` endpoint for Prometheus metrics while server is running.

## Next Steps

1. Start the server: `pnpm --filter lexbrain-server dev`
2. Test in Claude: Ask to store and retrieve a fact
3. Monitor: Check `http://localhost:6901/metrics` for performance metrics
4. Explore: Use locks to coordinate complex workflows
