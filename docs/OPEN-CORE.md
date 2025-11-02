# Open-core model

LexBrain Core (this repo) is MIT licensed:
- Protocols, SDK(s), MCP manifest(s)
- Single-node server (SQLite/WAL), append-only facts, advisory locks
- Zero-knowledge client-side encryption support

Planned Pro (separate, closed) features:
- Multi-tenant orgs & API keys, quotas/retention policies
- Postgres + clustering, pub/sub, background workers
- SSO (OIDC), audit trails, dashboards/analytics UI

We keep determinism in Core. Any heuristics/FTS remain advisory and off the critical path.
