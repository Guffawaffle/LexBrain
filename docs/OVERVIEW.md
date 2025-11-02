# LexBrain Overview

## The Pain

You're deep in a feature branch. It's 11 PM. Tests are failing. You've diagnosed the blocker: the Add User button is still disabled because the permissions gate isn't fully wired, and the admin UI is still calling a forbidden service directly. You write a quick comment in the code: `// TODO: wire UserAccessController and gate with can_manage_users`.

You go to sleep.

The next morning, you open your editor. Your assistant says: "How can I help?"

You spend 15 minutes re-explaining:

- Which ticket you were working on
- Which tests are failing and why
- Which feature flags are in play
- Why the button is still disabled
- What you need to do next

This happens **every day**.

Worse: when a teammate asks "hey, what's the deal with the Add User button?", you have to dig through Slack threads, scroll back through terminal history, and piece together the story from half-written notes like a raccoon.

LLM assistants are powerful, but they **forget**. Every new session starts from zero. You lose flow. You waste time.

---

## LexBrain's Answer

LexBrain gives you **persistent, queryable, timestamped work memory** called **Frames**.

A Frame is a deliberate snapshot of a meaningful engineering moment. It captures:

1. **State** — what was happening (failing tests, stack traces, diffs, blockers)
2. **Why it mattered** — the human summary ("Auth handshake timeout; Add User button still disabled")
3. **What's next** — the literal next action ("Enable Add User button for can_manage_users role")

When you return to the task later, you ask:

```bash
/recall TICKET-123
```

And you get back:

- The memory card image (tight, high-contrast panel showing the exact failure state)
- The `summary_caption` ("Auth handshake timeout; Add User button still disabled")
- The `status_snapshot.next_action` ("Enable Add User button for can_manage_users role")
- The timestamp and branch

Your assistant now has **instant continuity**. No re-explaining. No digging through logs. Just "here's where you left off."

That's the core value: **you get yesterday's brain back, on demand**.

---

## What a Frame Captures

A Frame stores three things:

### 1. A Rendered "Memory Card" Image

This is not a full screenshot. It's a purpose-built, high-contrast panel that shows exactly what mattered:

- Failing tests
- Stack trace / timeout message
- Diff summary / merge plan
- Current feature flag / permission assumptions
- Human caption: "This button is still disabled because X"

The image includes a header band with:

- Timestamp
- Branch name
- Ticket ID
- Module scope

**Why images?**

Dumping huge text logs into an LLM eats a ton of tokens. A compact rendered memory card image costs dramatically fewer tokens for a vision-capable model (roughly 7–20× context compression) while keeping enough detail for reasoning.

You still store the raw text, so you can recall exact strings if needed. The image is for cheap, high-signal recall.

### 2. The Raw Text Behind That Card

The exact logs, stack trace, `next_action`, blockers, etc.

Stored so we can do high-fidelity recall or quoting if needed.

### 3. Structured Metadata (The Index)

This is how Frames become searchable, referenceable, and aligned with architecture policy:

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

## How LexBrain Lets You Ask "What Was I Doing on TICKET-123?"

You literally type:

```bash
/recall TICKET-123
```

And you get a sane answer:

> "Last night at 11:04 PM on branch `feature/TICKET-123_auth_handshake_fix`, you were diagnosing an auth handshake timeout. Two tests were failing. You identified that the Add User button was still disabled because the admin UI (`ui/user-admin-panel`) was calling `services/auth-core` directly, which is forbidden. You left a note to enable the button for the `can_manage_users` role after fixing the `UserAccessController` wiring. Here's the memory card."

That's not magic. That's **structured recall**.

No digging through terminals. No re-explaining. The assistant reads the Frame and continues from there.

---

## This Is Not Screen Recording or Telemetry

LexBrain does **not**:

- Record everything you do
- Scrape your keystrokes
- Upload data to a cloud service by default
- Spy on you for management dashboards

LexBrain captures **intentional, high-signal checkpoints**.

You call `/remember` when:

- You've diagnosed a blocker
- You're about to switch branches
- You're about to go to sleep
- You're about to hand off to a teammate

If you don't call `/remember`, nothing is saved.

This is deliberate. Engineers will not adopt a "spy."

---

## How LexMap Fits In

LexBrain can run standalone and give you continuity ("what was I doing yesterday?").

But when you add **LexMap**, you unlock something deeper: **policy-aware reasoning**.

### THE CRITICAL RULE

> **THE CRITICAL RULE:**
> Every module name in `module_scope` MUST match the module IDs defined in LexMap's `lexmap.policy.json`.
> No ad hoc naming. No "almost the same module."
> If the vocabulary drifts, we lose the ability to line up:
>
> - "what you were actually doing last night"
>   with
> - "what the architecture is supposed to allow."

This rule is the bridge.

When you capture a Frame, LexBrain calls LexMap to resolve which modules own the files you touched. It records those canonical module IDs in `module_scope`.

Later, when you ask "Why is the Add User button still disabled?", the assistant can:

1. Pull the last Frame for that ticket from LexBrain
2. See `module_scope = ["ui/user-admin-panel", "services/auth-core"]`
3. Ask LexMap if `ui/user-admin-panel` is even allowed to call `services/auth-core` directly
4. Answer: "It's disabled because the UI was still talking straight to a forbidden service. Policy says that path must go through the approved service layer and be gated by `can_manage_users`. Here's the timestamped Frame from last night."

That's not vibes. That's **receipts**.

Without LexBrain + LexMap, your assistant guesses. With LexBrain + LexMap, your assistant **cites and explains**.

---

## The Shared Vocabulary Moat

Most AI coding tools operate in a vacuum. They see your code, but they don't know:

- What the architecture is **supposed** to allow
- Why you deliberately left something half-finished
- Which modules are forbidden from talking to each other

LexBrain + LexMap gives your assistant a **shared vocabulary** between:

- What you were doing (captured in Frames)
- What the architecture policy says you're allowed to do (defined in LexMap)

When those align, the assistant can tell you:

> "The admin panel is still calling `auth-core` directly. That's forbidden by policy. That's why you left the Add User button gated. Here's the Frame from 11:04 PM last night where you said you'd fix the `UserAccessController` wiring after sleep."

That's explainable, timestamped, policy-aware reasoning.

That's the moat.

---

## What This Means for Onboarding

Before LexBrain:

> You: "Hey, what's the deal with the Add User button?"
>
> Teammate: "Uh... I think someone was working on auth stuff? Let me scroll through Slack."

After LexBrain:

> You: `/recall Add User button`
>
> LexBrain: "Last touched on TICKET-123, 11:04 PM last night. The button is disabled because the admin UI is still calling a forbidden service. The engineer left a note to fix `UserAccessController` wiring and gate it with `can_manage_users`. Here's the memory card."

Onboarding a teammate into a half-finished feature goes from "good luck" to "here's the exact state, timestamp, and next action."

---

## This Is Not...

LexBrain is not:

- Production-hardened compliance tooling
- A management surveillance dashboard
- Magic autonomous dev that writes code for you

LexBrain is:

- A tool that gives you yesterday's brain back, on demand
- A way for assistants to explain WHY you left work in a half-finished state, without you re-explaining it
- A bridge to tie that explanation back to actual architectural rules in LexMap, if you opt in

---

## Status

LexBrain is **alpha**.

- Frames are stored in a local database (e.g. `/srv/lex-brain/thoughts.db`)
- MCP access via `stdio` (spawned process, no forced HTTP server)
- No telemetry
- Schema is treated as a contract; changes are deliberate

The memory card renderer doesn't have to be pretty; it has to be legible and consistent. Monospace panel, timestamp header—that's enough.

---

## Next Steps

- Read the [Adoption Guide](./ADOPTION_GUIDE.md) to roll out LexBrain in phases
- Read the [Mind Palace Guide](./MIND_PALACE.md) to learn about reference points and Atlas Frames
- Read the [Architecture Loop](./ARCHITECTURE_LOOP.md) to understand the full explainability story
- Read the [FAQ](./FAQ.md) for privacy, security, and compliance questions
- Read [Contributing](../CONTRIBUTING.md) to extend LexBrain safely
