# Mind Palace: Reference Point Memory System

## Overview

The **Mind Palace** system extends LexBrain's Frame-based memory with **reference points** and **Atlas Frames** to enable human-like recall without replaying full history or re-indexing entire codebases.

Instead of searching through all past work, you recall a **reference point** ("that auth bug when the Add User button was disabled") and the system expands only the relevant adjacent context.

## What is the Mind Palace System?

The Mind Palace builds on LexBrain's Frame concept with two key additions:

### 1. Reference Points

A **reference point** is a lightweight, human-memorable anchor phrase that represents an entire situation.

Examples:
- "Add User button still disabled"
- "Auth handshake timeout issue"
- "Payment gateway integration blocker"
- "Dark mode toggle bug"

Reference points are:
- **Short and memorable** - easy to recall days or weeks later
- **Situation-specific** - tied to a concrete problem or feature
- **Stable** - don't change as you iterate on the problem

### 2. Atlas Frames

An **Atlas Frame** is a structural snapshot of the module neighborhood relevant to your work. It captures:

- **Module coordinates** - spatial positions from LexMap policy
- **Adjacency graph** - which modules can/cannot talk to each other
- **Policy boundaries** - allowed vs forbidden edges
- **Fold radius** - controlled context expansion (typically 1-hop from reference module)

Together, reference points and Atlas Frames enable **instant, policy-aware context recall** without token-heavy re-indexing.

## How Reference Points Work

### Creating a Reference Point

When you capture a Frame with `/remember`, include a reference point:

```bash
lexbrain remember \
  --jira TICKET-123 \
  --branch feature/TICKET-123_auth_fix \
  --reference-point "Add User button still disabled" \
  --summary "Auth handshake timeout; admin panel calling forbidden service" \
  --next "Reroute through user-access-api instead of auth-core"
```

The reference point is stored in Frame metadata:

```json
{
  "reference_point": "Add User button still disabled",
  "timestamp": "2025-11-01T22:30:00Z",
  "module_scope": ["ui/user-admin-panel"],
  "summary_caption": "Auth handshake timeout; admin panel calling forbidden service",
  "status_snapshot": {
    "next_action": "Reroute through user-access-api instead of auth-core",
    "blockers": ["Direct call to auth-core forbidden by policy"]
  }
}
```

### Recalling by Reference Point

Days later, you ask:

```bash
lexbrain recall "Add User button"
```

Or simply tell your assistant:

> "Where did I leave off with the Add User button?"

The system:
1. Finds the most recent Frame matching that reference point (fuzzy match)
2. Retrieves the associated Atlas Frame
3. Returns both with full context

## Using `/recall` Effectively

### Basic Recall Patterns

**By reference point:**
```bash
/recall "Add User button"
/recall "auth timeout"
/recall "dark mode toggle"
```

**By ticket ID:**
```bash
/recall TICKET-123
```

**By keyword:**
```bash
/recall "forbidden service"
```

### What You Get Back

When you recall, the system returns:

1. **Frame metadata** - what you were doing, next action, blockers
2. **Atlas Frame** - visual map of relevant modules and boundaries
3. **Policy context** - which edges are allowed/forbidden
4. **Timeline** - when you captured this, which branch

Example response:

```json
{
  "frame": {
    "id": "frame_abc123",
    "timestamp": "2025-11-01T22:30:00Z",
    "reference_point": "Add User button still disabled",
    "module_scope": ["ui/user-admin-panel"],
    "summary_caption": "Auth handshake timeout; admin panel calling forbidden service",
    "status_snapshot": {
      "next_action": "Reroute through user-access-api instead of auth-core",
      "blockers": ["Direct call to auth-core forbidden by policy"]
    }
  },
  "atlas_frame": {
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
      },
      {
        "id": "services/auth-core",
        "coordinates": {"x": 8, "y": 3},
        "layer": "domain"
      }
    ],
    "edges": [
      {
        "from": "ui/user-admin-panel",
        "to": "services/user-access-api",
        "allowed": true
      },
      {
        "from": "ui/user-admin-panel",
        "to": "services/auth-core",
        "allowed": false
      }
    ],
    "critical_rule": "THE CRITICAL RULE: module_scope must use canonical module IDs from LexMap"
  }
}
```

Your assistant can now answer:

> "You left off in `ui/user-admin-panel`. The Add User button is still disabled because that module was calling `services/auth-core` directly, which is forbidden by policy. The allowed path is through `services/user-access-api`. Your next action was to reroute through that API. Here's the visual map of those modules and their boundaries."

## Understanding Atlas Frames

An Atlas Frame is **not** a full architecture diagram. It's a **controlled slice** of the structural context that matters for your recall.

### Fold Radius

The **fold radius** determines how much context to expand from your reference module.

- **Radius 0**: Just the reference module itself
- **Radius 1**: Reference module + direct neighbors (default)
- **Radius 2**: Reference module + neighbors + neighbors-of-neighbors

**Most recalls use radius 1.** This prevents context pollution while giving enough structure to reason about policy boundaries.

Example with radius 1 from `ui/user-admin-panel`:

```
Included:
- ui/user-admin-panel (reference)
- services/user-access-api (allowed neighbor)
- services/auth-core (forbidden neighbor - but shown to explain why it's blocked)

NOT included:
- database/user-store (2 hops away via user-access-api)
- ui/dashboard (unrelated sibling module)
```

### Policy Boundaries

Atlas Frames show **allowed** and **forbidden** edges:

- ✅ **Allowed edge**: You can call this module according to policy
- ❌ **Forbidden edge**: Policy blocks this call (useful for explaining blockers)

This is the key insight: the Atlas Frame doesn't just show structure, it shows **why something is blocked**.

### Coordinates and Layers

Modules have spatial coordinates (from LexMap policy):

```json
{
  "id": "ui/user-admin-panel",
  "coordinates": {"x": 2, "y": 5},
  "layer": "presentation"
}
```

Layers follow LexMap's onion architecture:
- `presentation` - UI/views
- `application` - services/APIs
- `domain` - core business logic
- `infrastructure` - database/external integrations

Coordinates enable visual rendering and distance-based reasoning.

## Best Practices for Reference Point Naming

### Good Reference Points

✅ **Concrete and specific:**
- "Add User button still disabled"
- "Payment webhook timeout on staging"
- "Dark mode CSS flash on page load"

✅ **Tied to a user-visible behavior:**
- "Search results empty for special characters"
- "Export button missing permissions gate"

✅ **Stable across iterations:**
- "Invoice PDF generation blocker" (not "Invoice PDF v3 retry logic")

### Avoid These

❌ **Too generic:**
- "Bug in UI"
- "Performance issue"
- "Auth problem"

❌ **Implementation details that change:**
- "UserController.validateSession line 42"
- "Webpack config hot reload race condition"

❌ **Time-bound phrases:**
- "Today's auth issue"
- "This morning's failing test"

### The Test

A good reference point passes this test:

> If you said this phrase to a teammate 3 weeks from now, would they know what you mean?

If yes, it's a good reference point.

## Examples of Effective Workflows

### Workflow 1: Mid-Task Context Switch

**Situation:** You're debugging the Add User button, but need to switch to an urgent bug.

```bash
# Capture current state
lexbrain remember \
  --jira TICKET-123 \
  --reference-point "Add User button still disabled" \
  --summary "Admin panel still calling auth-core directly" \
  --next "Reroute through user-access-api" \
  --context ./test-output.txt

# Switch to urgent bug
git checkout hotfix/payment-crash

# ... fix the urgent issue ...

# Return to original work
git checkout feature/TICKET-123_auth_fix
lexbrain recall "Add User button"
```

Your assistant immediately knows:
- Where you left off
- Why the button is disabled
- What to do next
- Which modules are involved
- Which policy edge is blocking you

### Workflow 2: Onboarding a Teammate

**Situation:** A teammate needs to pick up your half-finished work.

You:
```bash
lexbrain recall "Add User button"
```

Share the Frame ID with your teammate. They run:
```bash
lexbrain recall frame_abc123
```

They get:
- Complete context (no Slack archaeology)
- Visual map of relevant modules
- Policy boundaries
- Exact next action

No 30-minute explanation call needed.

### Workflow 3: Post-Mortem Debugging

**Situation:** A bug resurfaces 2 months later. You remember working on something similar.

You:
```bash
lexbrain recall "Add User button"
```

Even if you don't remember the exact details, the reference point anchors you. The Atlas Frame shows which modules were involved, and you can see if the current bug is hitting the same policy boundary.

### Workflow 4: Policy-Aware Reasoning

**Situation:** Your assistant suggests a "simple fix" that violates policy.

**Assistant:** "Just have the admin panel call auth-core directly for faster validation."

**You:** `/recall "Add User button"`

**System returns:**
- Frame showing you already tried that path
- Atlas Frame showing `ui/user-admin-panel → services/auth-core` is forbidden
- Policy says you must go through `user-access-api`

**Assistant:** "Ah, I see the policy boundary. That edge is forbidden. The correct path is through user-access-api. Let me suggest that instead."

The Atlas Frame prevents policy violations by making boundaries visible.

## Tips for Mind Palace Success

### Start with High-Signal Moments

Don't capture everything. Capture these moments:

- **Just diagnosed a blocker** - "Finally figured out why X is broken"
- **About to context-switch** - "Parking this to work on urgent issue"
- **End of day** - "Leaving this half-finished, here's where to resume"
- **Handoff to teammate** - "Here's the full context for you"

### Use Consistent Phrasing

If you call something "Add User button" in one Frame, don't call it "New User widget" in the next. Consistency makes recall easier.

### Leverage Keywords Too

Reference points are primary, but keywords supplement:

```bash
lexbrain remember \
  --reference-point "Add User button still disabled" \
  --keywords "auth,permissions,user-access-api,forbidden-service" \
  ...
```

If you forget the exact reference point, keyword search still works.

### Review Your Reference Points

Periodically check what reference points you've created:

```bash
lexbrain list-references
```

If you see duplicates or vague ones, improve your naming for next time.

### Combine with Ticket IDs

Always include both:

```bash
lexbrain remember \
  --jira TICKET-123 \
  --reference-point "Add User button still disabled" \
  ...
```

This enables recall by either ticket OR reference point:
- `/recall TICKET-123` (systematic)
- `/recall "Add User button"` (human memory)

## Limitations and Trade-offs

### What Mind Palace Is NOT

Mind Palace is not:
- **Full-text search** - use keywords for that
- **Complete architecture diagram** - use LexMap directly for that
- **Automatic** - you must intentionally create reference points
- **Time travel** - it won't recreate lost code, just context

### Token Efficiency vs Completeness

Atlas Frames deliberately **exclude** distant modules to save tokens. If you need fuller context, use LexMap's full policy export.

The trade-off:
- ✅ **Efficient recall** - get exactly the context that matters
- ❌ **Missing distant details** - may need to expand radius manually

### Fuzzy Matching Isn't Perfect

Reference point recall uses fuzzy matching:
- "Add User button" matches "Add User button still disabled" ✅
- "Add User" might match "Add Profile button" ⚠️

Be specific enough to avoid false matches.

### Stale Atlas Frames

Atlas Frames snapshot policy **at capture time**. If policy changes, old Atlas Frames may be outdated.

Best practice: When policy changes significantly, recapture Frames for active work.

## Integration with Existing LexBrain Features

Mind Palace extends, not replaces, LexBrain's core features:

### Frames

Reference points are added to existing Frame metadata:

```json
{
  "timestamp": "...",
  "branch": "...",
  "jira": ["TICKET-123"],
  "reference_point": "Add User button still disabled",  // NEW
  "module_scope": ["ui/user-admin-panel"],
  "summary_caption": "...",
  ...
}
```

### Module Scope (THE CRITICAL RULE)

THE CRITICAL RULE still applies:

> Every module name in `module_scope` MUST match the module IDs defined in LexMap's `lexmap.policy.json`.

Atlas Frames rely on this rule. If module IDs drift, Atlas Frames break.

### LexMap Integration

Mind Palace requires LexMap for:
- Module coordinates
- Adjacency graphs
- Policy boundaries

Without LexMap, you still get basic recall (via keywords/tickets), but **no Atlas Frames**.

## Privacy and Data Storage

Mind Palace follows LexBrain's local-first principles:

- **Reference points** - stored in local database (e.g. `/srv/lex-brain/thoughts.db`)
- **Atlas Frames** - stored alongside Frames, same local database
- **No upload by default** - everything stays on your machine
- **Intentional capture** - you control when reference points are created

If you enable optional sync (e.g. to your own S3 bucket), reference points and Atlas Frames are included in the backup.

## Next Steps

- **Try it:** Start with one reference point today
- **Iterate:** Refine your naming based on what's easy to recall
- **Share:** Hand off context to teammates using reference points
- **Read:** [Mind Palace Architecture](./MIND_PALACE_ARCHITECTURE.md) for implementation details

## See Also

- [Architecture Loop](./ARCHITECTURE_LOOP.md) - How LexBrain + LexMap enable explainability
- [Adoption Guide](./ADOPTION_GUIDE.md) - Rolling out Mind Palace in your workflow
- [FAQ](./FAQ.md) - Privacy, security, and compliance
- [LexMap Documentation](https://github.com/yourorg/LexMap) - Policy and module coordinates