# THE-FUTURE-BRAIN.md

(LexBrain / Visual Memory / Personal Working Context Layer)

## 0. Goal

LexBrain is not “AI notes.”
LexBrain is persistent working memory for an engineer.

It should let an assistant pick up right where we left off — across branches, across Jira tickets, across multi-PR merges — without me having to re-explain everything.

LexBrain does this by:

* capturing **Frames** (visual+text snapshots of meaningful work state),
* attaching **rich metadata / tags** that describe intent and scope,
* storing those Frames locally in a searchable store,
* retrieving the right Frames later (“what was I doing on WEB-23621?”),
* feeding them back to the model in a way that costs almost nothing in context tokens.

This doc defines how that memory works.

## 1. The Frame (core unit of memory)

A **Frame** is one durable checkpoint in time.

It’s created at the end of a meaningful unit of work, NOT on every little event.

Examples of good "checkpoint" moments:

* You've debugged an auth handshake failure to something actionable.
* You've figured out why "Add User button" is disabled in the UI.
* You've built/updated a merge-weave plan.
* You're about to walk away for the night.

### Frame = { image(s) + raw text + metadata }

**1.1 Rendered visual block(s)**

* We take the relevant text context (test failures, stack trace, merge order plan, etc.).
* We render it into a single, clean, high-contrast “memory card” image:

  * monospace text region
  * minimal syntax coloring / ANSI-style coloring
  * optional line numbers if code/trace
  * thin header band with context (timestamp, branch, Jira key, etc.)
* This is intentionally *not* a full desktop screenshot. It’s a legible artifact optimized for any vision-capable LLM.

**1.2 Raw text payload(s)**

* The exact text used to render that visual pane (logs, failing tests, short diff summary, PR dependency ordering).
* Stored alongside the image for future high-fidelity recall, grep, or quoting.

**1.3 Metadata / tags (critical)**
This is the actual “index” for LexBrain. Without this, recall is trash.

We attach structured metadata so future queries can pull the correct Frame fast:

```json
{
  "timestamp": "2025-11-01T16:04:12-05:00",
  "branch": "feature/TICKET-123_auth_handshake_fix",
  "jira": ["TICKET-123"],
  "feature_flags": ["beta_user_admin"],
  "module_scope": ["ui/user-admin-panel", "services/auth-core"],
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

Notes:

* `keywords` is not optional fluff. This is what makes fast lookup viable.
* `module_scope` ties this Frame to specific sub-areas of the codebase or feature slices. This is how we avoid needing to load "the whole repo" every time.
* **`module_scope` values MUST match module keys in LexMap `lexmap.policy.json`.** This is the bridge between LexBrain (temporal state) and LexMap (structural truth). See `lex-map/docs/schemas/lexbrain-frame-metadata.schema.json` for the canonical contract.
* `feature_flags` matters because gating and rollout state is part of "where we left off."

## 2. How a Frame is created

### 2.1 Triggers (who decides to snapshot?)

* `/remember` manual command (preferred).
* “End-of-session” event (e.g. user says “I’m done for tonight”).
* Explicit “save before changing branch / merging / rebasing.”
* (Optional later) Pattern triggers for major events like “multi-line test failure block with new error signature,” but those should *not* spam by default.

We do **not** record every console burp. These are intentional checkpoints.

### 2.2 Capture pipeline

When we create a Frame:

1. Collect source text blocks:

   * recent failing test output
   * relevant stack traces
   * short diff/plan summary (e.g. merge-weave order from lex-pr-runner)
   * short notes the user gave (what they’re doing / why it matters)
2. Detect context:

   * current git branch
   * Jira key(s) mentioned in the convo or branch name
   * feature flag(s) currently in play
   * modules touched (`services/auth-core`, `ui/user-admin-panel`, etc.)
3. Render the “memory card” image:

   * text in monospace panel
   * header strip with timestamp / branch / Jira / quick status
4. Generate metadata:

   * `summary_caption`
   * `keywords` (union of branch, Jira, key error terms, function/class names, module names, etc.)
   * structured `status_snapshot`
5. Persist:

   * Store image(s), raw text, metadata together in the LexBrain DB.

### 2.3 Human caption (optional but gold)

During `/remember`, allow the user to add a short human caption like:

> "Auth handshake timeout; Add User button still disabled due to perms gate"

That caption is saved in `summary_caption` *and* added to `keywords`.
This is the “why it matters” signal that future-you will actually search for.

## 3. Retrieval

When user asks:

> "Pick up TICKET-123 where we left off"
> or
> "What was blocking Add User button again?"

LexBrain does:

1. Query metadata first, NOT fulltext:

   * match `jira:TICKET-123`
   * match keywords: ["Add User disabled", "UserAccessController"]
   * match module_scope: ["ui/user-admin-panel"]
2. Return top N Frames (usually 1–3), newest-first.
3. For each Frame, return:

   * rendered image(s),
   * summary_caption,
   * timestamp,
   * branch,
   * status_snapshot.next_action.

That’s enough context for the assistant to operate like “I was literally there yesterday,” without you re-explaining everything.

If exact wording/code is needed, LexBrain can also expose the stored raw text from that Frame — but that’s now a fallback, not the default path. That keeps token usage efficient.

## 4. Why this makes AI “feel like it remembers”

* The assistant no longer needs you to re-paste stack traces, failure output, Jira acceptance criteria, or “what’s left in this feature flag path.”
* The assistant can instantly resume multi-day workstreams in a giant legacy codebase.
* You get continuity and accountability: "Here's WHY we left Add User button disabled," with timestamp.

This is dramatically better than “LLM context window,” because Frames are durable and queryable.

## 5. Metadata discipline (the non-negotiables)

LexBrain only works if metadata is consistent.

We will standardize these fields:

* `timestamp`: ISO8601 with local offset.
* `branch`: full branch name at time of snapshot.
* `jira`: array of ticket IDs referenced in branch name / caption (e.g. ["TICKET-123"]).
* `feature_flags`: array of active flags relevant to the work (e.g. ["beta_user_admin"]).
* `module_scope`: array of canonical module identifiers from lex-map (see THE_FUTURE-MAP.md).
* `summary_caption`: short human-readable description of "what matters here."
* `status_snapshot`:

  * `tests_failing`: integer
  * `merge_blockers`: array of strings
  * `next_action`: string
* `keywords`: flattened array of searchable tokens.
  Rules:

  * always include jira keys
  * always include branch name
  * include class/controller names touched
  * include main error string(s)
  * include feature flag names
  * include any architectural term from lex-map ("services/auth-core", "ui/user-admin-panel", "UserAccessController")

If a field is “unknown,” we still set it to `null` or `[]`. We don’t just omit it, because schemas that mutate shape are unsearchable. Indexers hate inconsistent records.

This metadata is the bridge between LexBrain (temporal state) and lex-map (structural truth).

## 6. Aging / condensation

Raw text is expensive to keep forever and noisy to resurface.

We add two lifecycle ops:

1. **Condense memories**

   * Merge multiple Frames for the same ticket / branch / module over several days into a single “Summary Frame.”
   * The Summary Frame keeps:

     * 1 composite rendered image with the key failures / blockers / decisions
     * union of keywords and metadata
   * Older granular Frames can be marked as archived, so retrieval favors the summary first.

2. **Cold archive**

   * After N days, mark old Frames read-only and keep only:

     * the rendered image
     * the metadata
     * (optionally) a compressed summary of the original text, not the full raw text
   * This keeps DB size sane.

Result: We preserve the *narrative* (“what was happening, why it mattered”) without hoarding every 500-line stack trace forever.

## 7. Security / boundaries

* LexBrain runs locally and stores `/srv/lex-brain/thoughts.db` (or similar).
* No default HTTP server. We expose LexBrain to AI tools via MCP `stdio` (spawned process with env vars).
* We only emit stored Frames + metadata when explicitly asked via tools like `lexbrain.recap`.
* We do NOT silently push Frames to remote services.

That “local-first, opt-in recall” is a selling point. Team adoption hinges on this never feeling like spyware.

## 8. Where this plugs into an assistant

When you say:

> "Remind me what was blocking TICKET-123."

The assistant calls `lexbrain.recap({ query: "TICKET-123" })`.

LexBrain:

* pulls the newest Frame with `jira:TICKET-123`,
* returns the rendered Frame image + caption + status_snapshot.next_action.

The assistant now has enough grounding to continue working like a real teammate:

* It knows which branch you were on.
* It knows what the blocker was.
* It even knows what you said you’d do next.

That’s continuity.

That continuity is the product.
