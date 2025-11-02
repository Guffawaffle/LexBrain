# Contributing to LexBrain

LexBrain is not "corporate open source governance." This is "don't break the schema and don't turn this into spyware."

We welcome contributions that make LexBrain more useful, more stable, or easier to adopt—but we won't accept changes that undermine the core principles:

1. **Local-first persistence** — data stays on the engineer's machine by default
2. **Intentional capture** — Frames are deliberate checkpoints, not surveillance
3. **Schema stability** — the Frame metadata contract must remain consistent
4. **THE CRITICAL RULE** — `module_scope` must use canonical module IDs from LexMap

---

## How to Contribute

### No PR Theater

We don't want "activity for the sake of activity." We want actual improvements:

- Bug fixes that make LexBrain more reliable
- New metadata fields that unlock better recall or policy reasoning
- Better renderers for memory card images
- Smarter heuristics for extracting keywords or detecting blockers
- Tighter integration with LexMap for module resolution

If you have something like that, open a PR. Explain the problem you're solving. Show the before/after. We'll review it.

### Before You Start

1. Check existing issues to see if someone else is already working on it
2. If you're proposing a major change (especially to the Frame schema), open an issue first to discuss
3. Make sure your changes don't break THE CRITICAL RULE or the local-first design

---

## How to Add New Metadata Fields to Frames

The Frame metadata schema is **contract-grade**. Other tools (LexMap, MCP clients, custom assistants) depend on it.

If you want to add a new field:

1. **Propose it in an issue first** — explain what problem it solves and why it belongs in every Frame
2. **Update the schema** — add the field to the Frame metadata type definition (in `src/types.ts` or equivalent) and to `docs/schemas/README.md`
3. **Update the docs** — the new field must be documented in `README.md`, `docs/OVERVIEW.md`, `docs/ARCHITECTURE_LOOP.md`, and `docs/schemas/README.md`
4. **Ensure backward compatibility** — existing Frames must still be readable; new fields should be optional or have sensible defaults
5. **Update the renderer** — if the field should appear on memory card images, update the image generation logic

Example of a good addition:

- `environment` (e.g. `"dev"`, `"staging"`, `"prod"`) — makes it clear which env the Frame was captured in

Example of a bad addition:

- `engineer_heartbeat_bpm` — this is surveillance; we don't do that

---

## How to Extend Capture Triggers

Right now, you manually call `/remember` to capture a Frame. You might want to add heuristics for auto-capture at "this matters" moments.

Safe extensions:

- Auto-capture when tests transition from passing → failing
- Auto-capture when you're about to `git checkout` a different branch
- Auto-capture when your assistant detects you're blocked (e.g. repeated failures on the same test)

Unsafe extensions:

- Auto-capture every 5 minutes (this is surveillance)
- Auto-capture every keystroke (absolutely not)
- Auto-capture without the engineer's knowledge

If you add a new trigger:

1. **Make it opt-in** — default to manual capture only
2. **Explain the trigger clearly** — document when/why it fires
3. **Respect local-first** — the trigger must not send data anywhere
4. **Test it** — show that it captures only high-signal moments

---

## Rules for Persistence

LexBrain stores Frames in a local database (e.g. `/srv/lex-brain/thoughts.db`).

You **must not**:

- Upload Frames to a remote server by default
- Require an HTTP endpoint for LexBrain to function
- Introduce telemetry that "phones home"

You **may**:

- Add optional sync to a user-controlled remote store (e.g. their own S3 bucket) if they explicitly configure it
- Add optional export to JSON/CSV for auditing or backup
- Add optional encryption at rest if the user wants it

Defaults must remain **local-first**.

---

## How to Integrate with LexMap

LexBrain calls LexMap to resolve file paths → canonical module IDs for `module_scope`.

If you're improving that integration:

1. **Respect THE CRITICAL RULE** — `module_scope` must use the exact module IDs from `lexmap.policy.json`
2. **Handle failures gracefully** — if LexMap isn't configured or returns an error, LexBrain should still capture the Frame (just with an empty or partial `module_scope`)
3. **Don't invent module names** — if LexMap doesn't recognize a file, leave that file out of `module_scope`; don't guess

Example:

```typescript
const moduleScope = await lexmapResolver.resolve(touchedFiles);
// Returns: ["ui/user-admin-panel", "services/auth-core"]
// If LexMap is unavailable, returns: []
```

If you add new LexMap integration points (e.g. resolving `feature_flags` or `permissions` from LexMap metadata), document them clearly.

---

## Schema Stability

The Frame metadata schema is a **contract**. Changes must be deliberate and backward-compatible.

Current schema (as of alpha):

```json
{
  "timestamp": "string (ISO 8601)",
  "branch": "string",
  "jira": ["string"],
  "module_scope": ["string"],
  "feature_flags": ["string"],
  "permissions": ["string"],
  "summary_caption": "string",
  "status_snapshot": {
    "tests_failing": "number",
    "merge_blockers": ["string"],
    "next_action": "string"
  },
  "keywords": ["string"]
}
```

If you change this:

1. You must update all docs that reference it
2. You must ensure old Frames can still be read
3. You must explain why the change is necessary

If you're just adding an optional field, that's usually fine. If you're removing or renaming a required field, that's a breaking change and requires a migration plan.

---

## MCP Access Must Remain Local/Stdio-First

LexBrain exposes Frames to assistants via **MCP over `stdio`** (spawned process with environment variables).

You **must not**:

- Force LexBrain to run as an HTTP server
- Require cloud authentication to access Frames
- Introduce dependencies that "call home"

You **may**:

- Add optional HTTP server mode for advanced users who want it
- Add optional TLS/auth if the user configures it
- Add optional integrations with other MCP servers (as long as they're local-first too)

The default experience must be: spawn `lexbrain-mcp-server`, talk to it over `stdio`, no network required.

---

## Testing

If you're adding new features:

1. Write a smoke test that proves it works
2. Test that it doesn't break existing Frame recall
3. Test that it doesn't violate local-first (no network calls unless user opts in)

Example smoke test:

```bash
# Capture a Frame
lexbrain remember --jira TEST-1 --summary "Test Frame" --next "Do the thing"

# Recall it
lexbrain recall TEST-1

# Should return the Frame with summary_caption and next_action
```

If that breaks, your change is not ready.

---

## Code Style

- Use TypeScript
- Use async/await, not callbacks
- Keep functions small and testable
- Comment complex logic
- No magic numbers or strings; use constants

We're not dogmatic, but we care about readability.

---

## Documentation

If you change behavior:

1. Update the relevant doc files (`README.md`, `docs/OVERVIEW.md`, etc.)
2. Update the FAQ if your change affects privacy, security, or LexMap integration
3. Update the Adoption Guide if your change affects the rollout flow

Documentation is not an afterthought. If you can't explain your change clearly, it's probably not ready.

---

## What We Won't Merge

- Changes that break THE CRITICAL RULE
- Changes that turn LexBrain into surveillance
- Changes that introduce "phone home" telemetry by default
- Changes that require engineers to trust a third-party service they don't control
- Changes that make the schema unstable or break existing Frames

---

## Questions?

Open an issue. Explain what you're trying to do and why. We'll help you figure out if it fits LexBrain's design principles.

We're not gatekeepers. We're just making sure LexBrain stays useful, trustworthy, and local-first.
