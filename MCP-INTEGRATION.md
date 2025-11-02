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
- **thought_put_atlas_frame**: Store Atlas Frame data for a work Frame with caching
- **thought_get_atlas_frame**: Retrieve Atlas Frame by ID, frame ID, or cached by reference module
- **thought_lock**: Acquire advisory locks
- **thought_unlock**: Release advisory locks

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

### thought.put_atlas_frame

Store an Atlas Frame for a work Frame with caching support.

**Input:**
```json
{
  "atlas_frame_id": "atlas_xyz789",
  "frame_id": "frame_abc123",
  "atlas_timestamp": "2025-11-01T22:30:00Z",
  "reference_module": "ui/user-admin-panel",
  "fold_radius": 1,
  "modules": [
    {
      "id": "ui/user-admin-panel",
      "coordinates": {"x": 2, "y": 5},
      "layer": "presentation"
    },
    {
      "id": "services/user-access-api",
      "coordinates": {"x": 5, "y": 5},
      "layer": "application"
    }
  ],
  "edges": [
    {
      "from": "ui/user-admin-panel",
      "to": "services/user-access-api",
      "allowed": true,
      "rule": "ui-must-use-service-layer"
    }
  ],
  "critical_rule": "THE CRITICAL RULE: module_scope must use canonical module IDs from LexMap"
}
```

**Output:**
```json
{
  "atlas_frame_id": "atlas_xyz789",
  "inserted": true
}
```

### thought.get_atlas_frame

Retrieve an Atlas Frame by ID, frame ID, or from cache by reference module and fold radius.

**Input (by atlas_frame_id):**
```json
{
  "atlas_frame_id": "atlas_xyz789"
}
```

**Input (by frame_id):**
```json
{
  "frame_id": "frame_abc123"
}
```

**Input (cached by reference_module and fold_radius):**
```json
{
  "reference_module": "ui/user-admin-panel",
  "fold_radius": 1
}
```

**Output:**
```json
{
  "content": {
    "atlas_frame_id": "atlas_xyz789",
    "frame_id": "frame_abc123",
    "atlas_timestamp": "2025-11-01T22:30:00Z",
    "reference_module": "ui/user-admin-panel",
    "fold_radius": 1,
    "modules": [...],
    "edges": [...],
    "critical_rule": "..."
  }
}
```

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

### Store and retrieve Atlas Frames

Store an Atlas Frame when creating a work Frame:

```
Store an Atlas Frame for frame_abc123 with reference module "ui/user-admin-panel" 
at fold radius 1, including modules and their allowed/forbidden edges.
```

Retrieve a cached Atlas Frame by module and radius:

```
Get the cached Atlas Frame for reference module "ui/user-admin-panel" 
with fold radius 1 to see the module neighborhood.
```

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
