# Quick Setup: Add LexBrain to VS Code

## For Windows with WSL

Add this to your VS Code `settings.json`:
(`Ctrl+Shift+P` → "Preferences: Open User Settings (JSON)")

### Option 1: Use bash -l to load full environment (Recommended)

```jsonc
{
  "github.copilot.chat.mcp.servers": {
    "lexbrain": {
      "command": "wsl",
      "args": [
        "--",
        "bash",
        "-lc",
        "node /srv/lex-mcp/lex-brain/mcp-server.mjs"
      ],
      "env": {
        "LEXBRAIN_DB": "/srv/lex-mcp/lex-brain/thoughts.db",
        "LEXBRAIN_MODE": "local"
      }
    }
  }
}
```

### Option 2: Use full path to node (if you know it)

```jsonc
{
  "github.copilot.chat.mcp.servers": {
    "lexbrain": {
      "command": "wsl",
      "args": [
        "--",
        "/home/guff/.nvm/versions/node/v22.20.0/bin/node",
        "/srv/lex-mcp/lex-brain/mcp-server.mjs"
      ],
      "env": {
        "LEXBRAIN_DB": "/srv/lex-mcp/lex-brain/thoughts.db",
        "LEXBRAIN_MODE": "local"
      }
    }
  }
}
```

## How It Works

1. **Copilot spawns** `wsl -- node /srv/lex-mcp/lex-brain/mcp-server.mjs`
2. **Environment vars** are passed: `LEXBRAIN_DB` and `LEXBRAIN_MODE`
3. **LexBrain starts**, opens SQLite database
4. **MCP protocol** runs over stdin/stdout
5. **Tools become available** to Copilot automatically

## Available Tools

- `thought_put` - Store a fact
- `thought_get` - Query facts
- `thought_lock` - Acquire lock
- `thought_unlock` - Release lock

## Test It

After adding to settings.json, restart VS Code and ask Copilot:

> "Use the thought_put tool to save a note that LexBrain is working"

Copilot will automatically discover and use the tool!
