# LexBrain Adoption Guide

This guide walks you through rolling out LexBrain in your workflow—step by step, no fluff, no surprises.

The goal: get to a state where you can `/recall TICKET-123` and your assistant instantly knows what you were doing, why you stopped, and what's next.

---

## Phase 1: Install LexBrain Locally and Confirm It Works

### Goal

Prove that LexBrain can capture a Frame and store it in a local database.

### Steps

1. **Clone the LexBrain repo**

   ```bash
   git clone https://github.com/yourorg/lexbrain.git /srv/lex-brain
   cd /srv/lex-brain
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   ```

3. **Run the setup script**

   ```bash
   ./start-lexbrain.sh
   ```

   This initializes the local database (e.g. `/srv/lex-brain/thoughts.db`).

4. **Capture a test Frame**

   ```bash
   lexbrain remember \
     --jira TEST-1 \
     --branch main \
     --summary "Testing LexBrain installation" \
     --next "Verify recall works"
   ```

5. **Recall that Frame**

   ```bash
   lexbrain recall TEST-1
   ```

   You should see:
   - The memory card image (or a path to it)
   - `summary_caption: "Testing LexBrain installation"`
   - `next_action: "Verify recall works"`
   - Timestamp and branch

If that works, you're ready for Phase 2.

---

## Phase 2: Capture Frames Manually at Meaningful Checkpoints

### Goal

Start using `/remember` in your daily workflow to build muscle memory and prove the value of Frames.

### When to Capture a Frame

Capture a Frame when:

- **You've diagnosed a blocker** ("The Add User button is disabled because the UI is calling a forbidden service")
- **You're about to switch branches** (so you can recall where you left off when you come back)
- **You're about to go to sleep** (so tomorrow-you gets instant continuity)
- **A test transitions from passing to failing** (so you capture the exact failure state)
- **You're about to hand off to a teammate** (so they get a clean summary)

### What NOT to Capture

Do NOT auto-capture constantly. This is not surveillance. Only capture high-signal "this matters" moments.

Examples of **bad** Frame triggers:

- Every 5 minutes
- Every keystroke
- Every time you open a file

If you're capturing more than 5–10 Frames per day, you're probably over-capturing.

### Example Workflow

You're working on `TICKET-123`. Tests are failing. You've identified the blocker:

```bash
lexbrain remember \
  --jira TICKET-123 \
  --branch feature/TICKET-123_auth_handshake_fix \
  --summary "Auth handshake timeout; Add User button still disabled" \
  --next "Enable Add User button for can_manage_users role" \
  --context ./latest-test-output.txt ./current-diff-summary.txt
```

The next morning:

```bash
lexbrain recall TICKET-123
```

You get:

- The memory card image showing the test failures
- `summary_caption: "Auth handshake timeout; Add User button still disabled"`
- `next_action: "Enable Add User button for can_manage_users role"`
- Timestamp: `2025-11-01T23:04:12-05:00`

Your assistant can now continue from there without you re-explaining.

### Tips

- **Be specific in `--summary`** — "Auth timeout" is vague; "Auth handshake timeout on connect_handshake_ms; Add User button still disabled" is useful
- **Always set `--next`** — this is for Future You; make it actionable
- **Use `--context`** — point to logs, diffs, or error output; LexBrain will render them in the memory card

---

## Phase 3: Tag Frames with Ticket IDs and Human Summaries

### Goal

Make Frames searchable and referenceable by ticket, keyword, or summary.

### Required Fields

When you call `/remember`, always provide:

- `--jira` (or equivalent ticket ID)
- `--summary` (the human "why this mattered")
- `--next` (the actionable next step)

### Optional But Recommended Fields

- `--branch` (which branch you're on; useful for recall)
- `--context` (paths to logs, diffs, error output)
- `--keywords` (explicit tags like "auth timeout", "Add User disabled")

### Example

```bash
lexbrain remember \
  --jira TICKET-123 \
  --branch feature/TICKET-123_auth_handshake_fix \
  --summary "Auth handshake timeout; Add User button still disabled" \
  --next "Enable Add User button for can_manage_users role" \
  --keywords "auth timeout,Add User disabled,connect_handshake_ms" \
  --context ./test-output.txt
```

Now you can recall by:

- Ticket: `/recall TICKET-123`
- Keyword: `/recall "auth timeout"`
- Summary: `/recall "Add User disabled"`

All of these return the same Frame.

---

## Phase 4: Integrate Module Scope Resolution via LexMap

### Goal

Wire LexBrain to LexMap so `module_scope` gets populated with canonical module IDs from your architecture policy.

### Why This Matters

Without `module_scope`, LexBrain gives you continuity ("what was I doing yesterday?").

With `module_scope`, LexBrain + LexMap gives you **policy-aware reasoning** ("why is this button still disabled? Because the UI is calling a forbidden module, which violates policy.").

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

### How to Integrate

1. **Install LexMap** (if you haven't already)

   ```bash
   git clone https://github.com/yourorg/lexmap.git /srv/lex-map
   cd /srv/lex-map
   pnpm install
   ```

2. **Configure LexBrain to call LexMap for module resolution**

   Edit `lexbrain.config.json`:

   ```json
   {
     "lexmap": {
       "enabled": true,
       "resolver_path": "/srv/lex-map/bin/resolve-modules"
     }
   }
   ```

3. **Capture a Frame and verify `module_scope` is populated**

   ```bash
   lexbrain remember \
     --jira TICKET-123 \
     --branch feature/TICKET-123_auth_handshake_fix \
     --summary "Auth handshake timeout; Add User button still disabled" \
     --next "Enable Add User button for can_manage_users role" \
     --context ./test-output.txt
   ```

   Recall it:

   ```bash
   lexbrain recall TICKET-123
   ```

   You should see:

   ```json
   {
     "module_scope": ["ui/user-admin-panel", "services/auth-core"],
     ...
   }
   ```

   Those module IDs should match what's in `lexmap.policy.json`.

4. **Test policy-aware reasoning**

   Ask your assistant:

   > "Why is the Add User button still disabled?"

   The assistant should:
   - Pull the Frame for `TICKET-123`
   - See `module_scope = ["ui/user-admin-panel", "services/auth-core"]`
   - Ask LexMap if `ui/user-admin-panel` is allowed to call `services/auth-core` directly
   - Answer: "It's disabled because the UI is calling a forbidden service. Policy says that path must go through the approved service layer and be gated by `can_manage_users`. Here's the timestamped Frame."

   That's the moat.

---

## Phase 5: Teach Your Assistant to Use `/recall`

### Goal

Wire your assistant (GitHub Copilot, Claude, etc.) to call `lexbrain recall <ticket>` when you ask about past work.

### How to Do This

1. **Configure your assistant to call LexBrain via MCP**

   Add this to your MCP config (e.g. `mcp-config.json`):

   ```json
   {
     "mcpServers": {
       "lexbrain": {
         "command": "/srv/lex-brain/mcp-stdio.mjs",
         "env": {
           "LEXBRAIN_DB": "/srv/lex-brain/thoughts.db"
         }
       }
     }
   }
   ```

2. **Test it**

   Ask your assistant:

   > "What was I doing on TICKET-123?"

   The assistant should:
   - Call `lexbrain recall TICKET-123` via MCP
   - Get the Frame
   - Answer: "You were diagnosing an auth handshake timeout. The Add User button was still disabled. You left a note to enable it for the `can_manage_users` role. Here's the memory card from 11:04 PM last night."

3. **Make it a habit**

   When you start a new task, ask:

   > "What was the last thing I did on TICKET-456?"

   The assistant pulls the Frame and tells you. No re-explaining.

---

## Strong Guidance: Do NOT Auto-Capture Everything

LexBrain is **not** surveillance.

You should capture 5–10 Frames per day, max. Only capture "this matters" moments:

- Diagnosed a blocker
- About to switch context
- About to hand off
- Test failure you need to remember

Do NOT:

- Auto-capture every 5 minutes
- Auto-capture every file save
- Auto-capture every terminal command

If you over-capture, Frames lose signal. You'll have too much noise and won't be able to find the meaningful ones.

The rule: **If it's not worth explaining to a teammate, don't capture it.**

---

## Summary

| Phase | Goal | Key Action |
|-------|------|------------|
| **Phase 1** | Prove LexBrain works | Capture and recall a test Frame |
| **Phase 2** | Build muscle memory | Use `/remember` at meaningful checkpoints |
| **Phase 3** | Make Frames searchable | Always tag with ticket ID, summary, and next action |
| **Phase 4** | Add policy-aware reasoning | Wire LexMap so `module_scope` is populated |
| **Phase 5** | Automate recall | Teach your assistant to call `/recall <ticket>` |
| **Phase 6** | Enable Mind Palace (optional) | Add reference points and Atlas Frames for natural recall |

By Phase 5, you should be able to:

- Ask "What was I doing on TICKET-123?" and get an instant answer
- Ask "Why is the Add User button still disabled?" and get an answer with receipts (Frame + policy violation)
- Hand off a half-finished feature to a teammate by sharing a Frame

By Phase 6 (Mind Palace), you can also:

- Recall by natural phrasing: "Where did I leave off with the payment webhook?"
- Get structural context via Atlas Frames (module neighborhoods + policy boundaries)
- Use fold radius to control context expansion

That's the value of LexBrain.

---

## Phase 6: Enable Mind Palace Features (Optional)

### Goal

Upgrade to reference point-based recall with Atlas Frames for even faster, more intuitive context retrieval.

### What is Mind Palace?

Mind Palace extends LexBrain with:
- **Reference points** - human-memorable anchor phrases ("Add User button still disabled")
- **Atlas Frames** - structural snapshots of relevant module neighborhoods
- **Fold radius** - controlled context expansion to prevent token bloat

This enables questions like:

> "Where did I leave off with the Add User button?"

Instead of searching by ticket ID, you recall by natural phrasing.

### Prerequisites

1. **LexBrain working** - Phases 1-5 complete
2. **LexMap configured** - Mind Palace requires LexMap for module coordinates
3. **Policy has coordinates** - Your `lexmap.policy.json` must include module coordinates

### Step 1: Add Coordinates to LexMap Policy

Edit your `lexmap.policy.json` to include coordinates for each module:

```json
{
  "modules": [
    {
      "id": "ui/user-admin-panel",
      "path": "src/ui/user-admin",
      "layer": "presentation",
      "coordinates": {"x": 2, "y": 5}
    },
    {
      "id": "services/user-access-api",
      "path": "src/services/user-access",
      "layer": "application",
      "coordinates": {"x": 5, "y": 5}
    },
    {
      "id": "services/auth-core",
      "path": "src/services/auth-core",
      "layer": "domain",
      "coordinates": {"x": 8, "y": 3}
    }
  ]
}
```

**Coordinate guidelines:**
- Use a consistent scale (e.g. 0-10 for both x and y)
- Place related modules near each other
- Respect layer boundaries (presentation left, infrastructure right)
- Unique coordinates per module

### Step 2: Verify LexMap Adjacency Export

Test that LexMap can generate Atlas Frames:

```bash
lexmap export-adjacency \
  --reference-module ui/user-admin-panel \
  --fold-radius 1 \
  --output test-atlas.json

cat test-atlas.json
```

You should see:

```json
{
  "reference_module": "ui/user-admin-panel",
  "fold_radius": 1,
  "modules": [
    {"id": "ui/user-admin-panel", "coordinates": {"x": 2, "y": 5}, "layer": "presentation"},
    {"id": "services/user-access-api", "coordinates": {"x": 5, "y": 5}, "layer": "application"}
  ],
  "edges": [
    {"from": "ui/user-admin-panel", "to": "services/user-access-api", "allowed": true}
  ]
}
```

### Step 3: Enable Mind Palace in LexBrain

Edit `lexbrain.config.json`:

```json
{
  "lexmap": {
    "enabled": true,
    "resolver_path": "/srv/lex-map/bin/resolve-modules"
  },
  "mind_palace": {
    "enabled": true,
    "default_fold_radius": 1,
    "generate_atlas_frames": true
  }
}
```

### Step 4: Capture a Frame with Reference Point

```bash
lexbrain remember \
  --jira TICKET-456 \
  --branch feature/TICKET-456_payment_fix \
  --reference-point "Payment webhook timeout on staging" \
  --summary "Webhook handler timing out after 30s" \
  --next "Increase timeout to 60s and add retry logic" \
  --context ./webhook-logs.txt
```

### Step 5: Recall by Reference Point

```bash
lexbrain recall "Payment webhook"
```

Or ask your assistant:

> "Where did I leave off with the payment webhook?"

You should get back:
- The Frame (summary, next_action, timestamp)
- The Atlas Frame (module neighborhood, policy boundaries)

### Step 6: Verify Atlas Frame Was Generated

Check the response includes an Atlas Frame:

```json
{
  "frame": {
    "reference_point": "Payment webhook timeout on staging",
    "module_scope": ["services/webhook-handler"],
    ...
  },
  "atlas_frame": {
    "reference_module": "services/webhook-handler",
    "fold_radius": 1,
    "modules": [...],
    "edges": [...]
  }
}
```

### Best Practices for Reference Points

✅ **Good reference points:**
- "Payment webhook timeout on staging"
- "Add User button still disabled"
- "Dark mode CSS flash on page load"

❌ **Avoid:**
- "Bug in code" (too vague)
- "WebhookController line 42" (too implementation-specific)
- "Today's issue" (not stable across time)

### Migrating Existing Frames

If you have existing Frames without reference points, you can backfill them:

```bash
# Manual approach: recall and re-capture with reference point
lexbrain recall TICKET-123

# Copy the summary to create a reference point
lexbrain remember \
  --jira TICKET-123 \
  --reference-point "Add User button still disabled" \
  --summary "<copy from previous Frame>" \
  --next "<copy from previous Frame>"
```

Or use the migration tool (if available):

```bash
lexbrain migrate add-reference-points \
  --dry-run \
  --strategy extract-from-summary
```

### Testing Recall Functionality

Test different recall patterns:

**By reference point:**
```bash
lexbrain recall "payment webhook"
```

**By ticket ID (still works):**
```bash
lexbrain recall TICKET-456
```

**By keyword (fallback):**
```bash
lexbrain recall "timeout"
```

All should return the same Frame + Atlas Frame.

### Adjusting Fold Radius

If you need more context, increase the fold radius:

```bash
lexbrain recall "payment webhook" --fold-radius 2
```

This includes 2-hop neighbors instead of just 1-hop.

**Trade-off:**
- Radius 1: ~5-10 modules, ~2,000-5,000 tokens
- Radius 2: ~20-50 modules, ~10,000-25,000 tokens

Start with radius 1 (default). Only increase if needed.

---

## Troubleshooting

### "My Frames aren't showing up when I recall"

- Check that the local DB exists: `ls /srv/lex-brain/thoughts.db`
- Check that you provided `--jira` when capturing
- Try recalling by keyword: `/recall "auth timeout"`

### "My `module_scope` is empty"

- Check that LexMap is configured in `lexbrain.config.json`
- Check that the files you touched are recognized by LexMap (run `lexmap scan` and verify the output)
- Check that the module IDs in `lexmap.policy.json` match what LexBrain is trying to resolve

### "My assistant isn't calling `/recall`"

- Check that LexBrain is configured in your MCP config
- Check that the assistant has access to the `lexbrain` MCP server
- Try calling it manually via MCP to verify it works: `mcp call lexbrain recall TICKET-123`

### "Atlas Frames aren't being generated"

- Verify LexMap is configured and accessible: `lexmap version`
- Check that your `lexmap.policy.json` includes coordinates for modules
- Test adjacency export manually: `lexmap export-adjacency --reference-module <module> --fold-radius 1`
- Check `mind_palace.enabled` is `true` in `lexbrain.config.json`

### "Reference point recall doesn't find my Frame"

- Check the exact reference point text: `lexbrain list-references`
- Try a shorter query: "payment webhook" instead of "payment webhook timeout on staging"
- Verify normalization: `lexbrain debug-normalize "payment webhook"`
- Fall back to ticket ID if fuzzy matching fails: `/recall TICKET-456`

### "Atlas Frame shows stale modules"

- Your policy may have changed since the Frame was captured
- Atlas Frames snapshot policy **at capture time**
- Re-capture the Frame to get updated Atlas Frame: `lexbrain remember --jira TICKET-456 --reference-point "..." --summary "..."`

---

## Next Steps

- Read [Mind Palace Guide](./MIND_PALACE.md) to learn about reference points and Atlas Frames
- Read [Mind Palace Architecture](./MIND_PALACE_ARCHITECTURE.md) for implementation details
- Read [Architecture Loop](./ARCHITECTURE_LOOP.md) to understand the full explainability story
- Read [FAQ](./FAQ.md) for privacy, security, and compliance questions
- Read [Contributing](../CONTRIBUTING.md) to extend LexBrain safely
