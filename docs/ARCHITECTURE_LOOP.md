# LexBrain Architecture Loop

This document explains the moat.

Most AI coding assistants operate in a vacuum. They see your code, but they don't know:

- What the architecture is **supposed** to allow
- Why you deliberately left something half-finished
- Which modules are forbidden from talking to each other

LexBrain + LexMap solves this. Here's how.

---

## The Loop

### 1. You're Doing Work on a Feature

You're working on `TICKET-123`: enabling the Add User button in the admin panel.

You're on branch `feature/TICKET-123_auth_handshake_fix`.

You've been debugging for an hour. Tests are failing. You've identified the blocker:

- The admin UI (`ui/user-admin-panel`) is calling `services/auth-core` directly.
- That call path is **forbidden** by your architecture policy (defined in LexMap's `lexmap.policy.json`).
- The correct path is: UI → approved service layer → auth-core, gated by the `can_manage_users` permission.
- You've left the Add User button disabled until you fix the wiring.

It's 11 PM. You're about to go to sleep.

---

### 2. You Hit `/remember`

You call:

```bash
lexbrain remember \
  --jira TICKET-123 \
  --branch feature/TICKET-123_auth_handshake_fix \
  --summary "Auth handshake timeout; Add User button still disabled in admin panel" \
  --next "Enable Add User button for can_manage_users role" \
  --context ./test-output.txt ./current-diff.txt
```

LexBrain does the following:

1. **Generates a memory card image** from your text inputs

   - Monospace panel showing test failures, stack trace, timeout message
   - Header band with timestamp (`2025-11-01T23:04:12-05:00`), branch, ticket ID
   - Human summary: "Auth handshake timeout; Add User button still disabled"
   - Next action: "Enable Add User button for can_manage_users role"

2. **Extracts keywords** from the summary and context

   - `"Add User disabled"`, `"auth handshake timeout"`, `"connect_handshake_ms"`, `"UserAccessController"`, `"ExternalAuthClient"`, `"TICKET-123"`

3. **Resolves `module_scope`** by calling LexMap

   - Asks LexMap: "Which modules own these files?"
   - LexMap responds: `["ui/user-admin-panel", "services/auth-core"]`
   - LexBrain records those canonical module IDs in the Frame metadata

4. **Stores the Frame** (image + raw text + metadata) in the local database

---

### 3. The Frame Metadata

Here's what gets stored:

```json
{
  "timestamp": "2025-11-01T23:04:12-05:00",
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

- `module_scope` — the canonical module IDs from LexMap
- `summary_caption` — the human "why this mattered"
- `status_snapshot.next_action` — literally "what Future Me needs to do next"

---

### 4. Later, You Ask `/recall TICKET-123`

The next morning, you open your editor. You ask:

```bash
/recall TICKET-123
```

LexBrain returns:

- The memory card image (showing the exact test failures and timeout message)
- `summary_caption: "Auth handshake timeout; Add User button still disabled in admin panel"`
- `status_snapshot.next_action: "Enable Add User button for can_manage_users role"`
- `module_scope: ["ui/user-admin-panel", "services/auth-core"]`
- Timestamp: `2025-11-01T23:04:12-05:00`

Your assistant now has **instant continuity**. No re-explaining.

---

### 5. The Assistant Lines It Up with LexMap

Now here's where the moat kicks in.

You ask:

> "Why is the Add User button still disabled?"

The assistant does the following:

1. **Pulls the Frame** for `TICKET-123` from LexBrain
2. **Sees `module_scope = ["ui/user-admin-panel", "services/auth-core"]`**
3. **Asks LexMap** if `ui/user-admin-panel` is allowed to call `services/auth-core` directly
4. **LexMap responds**: "No. That call path is forbidden. The UI must go through the approved service layer and be gated by `can_manage_users`."
5. **The assistant answers**:

   > "The Add User button is still disabled because the admin UI (`ui/user-admin-panel`) was calling `services/auth-core` directly, which is forbidden by policy. Policy says that path must go through the approved service layer and be gated by the `can_manage_users` permission. Here's the timestamped Frame from 11:04 PM last night where you said you'd fix the `UserAccessController` wiring after sleep."

That's not vibes. That's **receipts**.

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

This rule is the bridge.

If you follow it, your assistant can:

- Cite exact Frames from last night
- Line those Frames up with architectural policy
- Explain WHY a button is disabled (not just "it's disabled," but "it's disabled **because** the UI is calling a forbidden service")

If you break it (e.g. LexBrain says `module_scope = ["admin-panel"]` but LexMap says `ui/user-admin-panel`), the assistant can't make the connection. You lose explainability.

---

## Contrast: Without LexBrain + LexMap

### Without LexBrain

You ask:

> "What was I doing on TICKET-123?"

The assistant says:

> "I don't know. You didn't tell me."

You spend 15 minutes re-explaining the failure state, the blocker, the gating logic, and the next step.

### Without LexMap

You ask:

> "Why is the Add User button still disabled?"

The assistant guesses:

> "Maybe the permissions aren't set up? Try checking the role configuration."

You have to explain:

> "No, it's because the UI is calling auth-core directly, which is forbidden. That's why I left it gated."

The assistant has no receipts. It's just guessing.

### With LexBrain + LexMap

You ask:

> "Why is the Add User button still disabled?"

The assistant says:

> "The admin UI is calling `services/auth-core` directly, which is forbidden by policy. Policy says that path must go through the approved service layer and be gated by `can_manage_users`. Here's the timestamped Frame from 11:04 PM last night."

**That's the difference.**

---

## How This Scales

### One Engineer, One Ticket

LexBrain gives you continuity. You can recall what you were doing yesterday without re-explaining.

### One Team, Many Tickets

LexBrain gives you a shared memory. A teammate can ask:

> "What's the deal with the Add User button?"

And get:

> "Last touched on TICKET-123, 11:04 PM last night. The button is disabled because the admin UI is calling a forbidden service. The engineer left a note to fix `UserAccessController` wiring and gate it with `can_manage_users`. Here's the memory card."

Onboarding a teammate into a half-finished feature goes from "good luck" to "here's the exact state, timestamp, and next action."

### One Org, Many Teams

If every team uses:

- LexBrain for persistent work memory
- LexMap for shared architectural vocabulary

Then assistants can:

- Cite exact Frames across teams
- Line those Frames up with org-wide policy
- Explain WHY a feature is blocked (not just "it's blocked," but "it's blocked **because** Team A's UI is calling Team B's forbidden service")

That's **explainable, timestamped, policy-aware reasoning at org scale**.

---

## The Moat

Most AI coding tools operate in a vacuum. They see your code, but they don't know:

- What you were doing last night
- Why you left it half-finished
- What the architecture is supposed to allow

LexBrain + LexMap gives your assistant a **shared vocabulary** between:

- What you were doing (captured in Frames)
- What the architecture policy says you're allowed to do (defined in LexMap)

When those align, the assistant can tell you:

> "The admin panel is still calling `auth-core` directly. That's forbidden by policy. That's why you left the Add User button gated. Here's the Frame from 11:04 PM last night where you said you'd fix the `UserAccessController` wiring after sleep."

That's the moat.

Without this, AI agents guess. With this, they cite and explain.

---

## What This Means for You

You get:

1. **Instant continuity** — `/recall TICKET-123` gives you yesterday's brain back
2. **Policy-aware reasoning** — "Why is this button still off?" gets answered with receipts
3. **Explainable hand-offs** — teammates get exact state, timestamp, and next action
4. **Architectural enforcement** — assistants can cite policy violations from timestamped Frames

All of this is local-first, intentional, and engineer-controlled.

No surveillance. No cloud upload. No "phone home."

Just: "Here's what you were doing, why it mattered, and what you said you'd do next."

---

## Next Steps

- Read the [Adoption Guide](./ADOPTION_GUIDE.md) to roll out LexBrain in phases
- Read the [Mind Palace Guide](./MIND_PALACE.md) to learn about reference points and Atlas Frames
- Read the [FAQ](./FAQ.md) for privacy, security, and compliance questions
- Read [Contributing](../CONTRIBUTING.md) to extend LexBrain safely
