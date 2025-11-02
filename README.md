# LexBrain

**Persistent working memory for engineers.**

LexBrain solves a specific pain: LLM assistants forget what you were doing yesterday. You lose flow. You waste time re-explaining the same context every morning.

LexBrain fixes that with **Frames**.

---

## What is LexBrain?

LexBrain is a local-first memory system that captures deliberate snapshots of meaningful engineering moments—we call these **Frames**.

A Frame stores:

1. **A rendered "memory card" image** — a tight, high-contrast panel showing exactly what mattered (failing tests, stack traces, diff summaries, blockers, next actions)
2. **The raw text** behind that card (logs, exact commands, error messages)
3. **Structured metadata** — timestamp, branch, ticket IDs, module scope, feature flags, permissions, status snapshot, and keywords

When you return to a task hours or days later, you can `/recall TICKET-123` and get instant continuity: the assistant sees exactly where you left off, why you stopped, and what you planned to do next—without you re-explaining anything.

---

## Why Normal AI Assistants Forget

Every time you start a new chat session or switch contexts, the assistant starts from zero. You have to:

- Re-explain what you were debugging
- Re-describe which tests are failing and why
- Re-state which feature flags or permissions are in play
- Re-justify why that button is still disabled

This is exhausting and kills productivity.

LexBrain gives you **yesterday's brain back, on demand**.

---

## What is a Frame?

A **Frame** is a deliberate snapshot of a meaningful engineering moment.

Typical trigger points:

- End of a debugging push
- Just before switching branches
- Just before sleep
- Right after diagnosing a blocker ("The Add User button is still disabled because the permissions gate isn't wired and the UI is calling a forbidden service")
- Right before handing off to someone else

A Frame is **not** surveillance. You trigger it intentionally. If you don't call `/remember`, nothing is saved.

### Why Images?

Dumping huge text logs into an LLM eats tons of tokens. A compact rendered "memory card" image with those logs (monospace text panel, timestamp header, current blockers) costs dramatically fewer tokens for a vision-capable model—roughly 7–20× context compression—while keeping enough detail for reasoning.

You still store the raw text for exact recall when needed.

---

## How to Save a Frame

```bash
lexbrain remember \
  --jira TICKET-123 \
  --branch feature/TICKET-123_auth_handshake_fix \
  --summary "Auth handshake timeout; Add User button still disabled" \
  --next "Enable Add User button for can_manage_users role" \
  --context ./latest-test-output.txt ./current-diff-summary.txt
```

This:

- Generates a rendered memory card image from your text inputs
- Extracts keywords ("auth handshake timeout", "Add User disabled", etc.)
- Resolves `module_scope` by asking LexMap which modules own the touched files/paths (e.g. `ui/user-admin-panel`, `services/auth-core`)
- Stores the Frame (image + text + metadata) in the local database

---

## How to Recall a Frame

```bash
lexbrain recall TICKET-123
```

Returns:

- The most recent Frame for that ticket
- The memory card image
- The `summary_caption`
- The `status_snapshot.next_action`
- The branch and timestamp

Your assistant gets instant continuity on the ticket across days without you re-explaining the failure state, the gating logic, or the next step.

---

## Frame Metadata Structure

Here's what a Frame looks like under the hood:

```json
{
  "timestamp": "2025-11-01T16:04:12-05:00",
  "branch": "feature/TICKET-123_auth_handshake_fix",
  "jira": ["TICKET-123"],
  "module_scope": ["ui/user-admin-panel", "services/auth-core"],
  "feature_flags": ["beta_user_admin"],
  "permissions": ["can_manage_users"],
  "summary_caption": "Auth handshake timeout; Add User button still disabled in admin panel",
  "status_snapshot": {
    "tests_failing": 2,
    "merge_blockers": [
      "UserAccessController wiring",
      "ExternalAuthClient timeout handling"
    ],
    "next_action": "Enable Add User button for can_manage_users role"
  },
  "keywords": [
    "Add User disabled",
    "auth handshake timeout",
    "connect_handshake_ms",
    "UserAccessController",
    "ExternalAuthClient",
    "TICKET-123"
  ]
}
```

Key fields:

- `summary_caption` — the human "why this mattered"
- `status_snapshot.next_action` — literally "what Future Me needs to do next"
- `keywords` — for fast search ("that auth handshake timeout issue," "Add User disabled," etc.)
- `module_scope` — where LexMap plugs in (see below)

---

## Where Data is Stored

Frames are stored in a **local database** (for example: `/srv/lex-brain/thoughts.db`).

LexBrain is designed to expose Frames to an assistant through **MCP over `stdio`** (spawned process with environment variables).

- LexBrain does **not** have to run an HTTP server.
- LexBrain does **not** upload Frames anywhere by default.
- LexBrain does **not** secretly scrape or record everything you do.

You trigger Frame capture intentionally. If you don't call `/remember`, nothing is saved.

---

## THE CRITICAL RULE

> **THE CRITICAL RULE:**
> Every module name in `module_scope` MUST match the module IDs defined in LexMap's `lexmap.policy.json`.
> No ad hoc naming. No "almost the same module."
> If the vocabulary drifts, we lose the ability to line up:
>
> - "what you were actually doing last night"
>   with
> - "what the architecture is supposed to allow."

This rule is the bridge between memory and policy.

### How LexBrain Uses Module IDs from LexMap

When you capture a Frame, LexBrain calls out to **LexMap** (if configured) to resolve which modules own the files you touched. It records those canonical module IDs in `module_scope`.

Later, when you ask "Why is the Add User button still disabled?", the assistant can:

1. Pull the last Frame for that ticket from LexBrain
2. See `module_scope = ["ui/user-admin-panel", "services/auth-core"]`
3. Ask LexMap if `ui/user-admin-panel` is even allowed to call `services/auth-core` directly
4. Answer: "It's disabled because the UI was still talking straight to a forbidden service. Policy says that path must go through the approved service layer and be gated by `can_manage_users`. Here's the timestamped Frame from last night."

That's not vibes. That's **receipts**.

You can run LexBrain standalone without LexMap and just get continuity ("what was I doing yesterday?"). You add LexMap when you want policy-aware reasoning ("why is this button still off?").

---

## Status

LexBrain is **alpha**.

- Local-only
- MCP via `stdio`
- No telemetry
- Frame metadata schema is treated as a contract; changes are deliberate

The renderer for the memory card image doesn't have to be pretty; it has to be legible and consistent. Monospace panel, timestamp header—that's enough.

We store both the rendered image (cheap to feed to vision-capable LLMs for context compression) and the raw text (for exact recall).

---

## What This Is Not

LexBrain is not:

- Production-hardened compliance tooling
- A management dashboard
- Magic autonomous dev
- Surveillance or keylogging

LexBrain is:

- A tool that gives you yesterday's brain back, on demand
- A way for assistants to explain WHY you left work in a half-finished state, without you re-explaining it
- A bridge to tie that explanation back to actual architectural rules in LexMap, if you opt in

---

## Learn More

- [Overview](./docs/OVERVIEW.md) — the pain, the solution, the moat
- [Policy Documentation](./docs/POLICY.md) — LexMap policy schema and spatial coordinates
- [Adoption Guide](./docs/ADOPTION_GUIDE.md) — how to roll out LexBrain in phases
- [Architecture Loop](./docs/ARCHITECTURE_LOOP.md) — the full explainability story
- [FAQ](./docs/FAQ.md) — privacy, security, compliance
- [Contributing](./CONTRIBUTING.md) — how to extend LexBrain safely

---

## License

See [LICENSE](./LICENSE).

