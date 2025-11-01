# LexBrain - Deterministic Knowledge Storage System

A TypeScript monorepo providing deterministic, append-only fact storage with client-side encryption capabilities.

## Quick Start

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm -r build

# Start development server
pnpm dev

# Run smoke tests
pnpm smoke
```

## Architecture

- **packages/server**: Express + better-sqlite3 MVP service
- **packages/sdk-ts**: TypeScript client SDK (@lex/lexbrain)
- **packages/mcp**: MCP manifest + JSON schemas

## API Endpoints

### PUT fact
```bash
curl -X POST http://localhost:8123/put \
  -H "Content-Type: application/json" \
  -d '{
    "kind": "repo_scan",
    "scope": {"repo": "demo", "commit": "deadbeef"},
    "inputs_hash": "abc123",
    "payload": {"hello": "world"}
  }'
```

### GET facts
```bash
curl -X POST http://localhost:8123/get \
  -H "Content-Type: application/json" \
  -d '{
    "repo": "demo",
    "commit": "deadbeef",
    "kind": "repo_scan"
  }'
```

### Lock/Unlock
```bash
# Acquire lock
curl -X POST http://localhost:8123/lock \
  -H "Content-Type: application/json" \
  -d '{"name": "my-lock"}'

# Release lock
curl -X POST http://localhost:8123/unlock \
  -H "Content-Type: application/json" \
  -d '{"name": "my-lock"}'
```

## SDK Usage

```typescript
import { LexBrain } from '@lex/lexbrain';

// Local mode (no encryption)
const brain = new LexBrain({
  url: 'http://localhost:8123',
  mode: 'local'
});

// ZK mode (client-side encryption)
const zkBrain = new LexBrain({
  url: 'http://localhost:8123',
  mode: 'zk',
  keyHex: '0123456789abcdef...' // 32-byte hex key
});

// Store a fact
const inputsHash = LexBrain.inputsHash({ source: 'scan' });
const result = await brain.put({
  kind: 'repo_scan',
  scope: { repo: 'my-repo', commit: 'abc123' },
  inputs_hash: inputsHash,
  payload: { files: ['src/main.ts'] }
});

// Query facts
const facts = await brain.get({
  repo: 'my-repo',
  commit: 'abc123',
  kind: 'repo_scan'
});
```

## Metrics

Prometheus metrics available at `http://localhost:8123/metrics`:
- Request counters for put/get/lock operations
- Response time histograms
- Hit/miss ratios for cache performance

## Configuration

Environment variables:
- `PORT`: Server port (default: 8123)
- `LEXBRAIN_DB`: Database path (default: ./thoughts.db)
- `LEXBRAIN_MODE`: "local" or "zk" (default: local)
- `LEXBRAIN_KEY_HEX`: 64-char hex key for ZK mode
- `LEXBRAIN_TTL_DAYS`: Default TTL in days (default: 7)
- `LEXBRAIN_MAX_PAYLOAD_KB`: Max payload size (default: 256)

## Docker Deployment

```bash
docker-compose up -d
```

## Performance Targets

- p95 GET ≤ 50ms
- p95 PUT ≤ 200ms
- Tested on 2 vCPU VM

## License

MIT © 2025 Guffawaffle. See [LICENSE](./LICENSE).

## Open-core

Core is MIT. Future Pro features (multi-tenant, SSO, quotas, dashboards) will ship separately.
See [docs/OPEN-CORE.md](./docs/OPEN-CORE.md).

