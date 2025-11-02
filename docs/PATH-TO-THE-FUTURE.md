# Path to the Future – LexBrain Roadmap

This document breaks down the vision in `THE-FUTURE.md` into actionable epics and issues for GitHub.

## Core Insight

**Frames are auto-generated from text context, NOT manual screenshots.**

When a user hits `/remember` or ends a session, LexBrain:
1. Takes current text context (logs, errors, test output, merge plans, etc.)
2. Auto-detects metadata (Jira keys, branch, test status, module scope, feature flags)
3. Renders it as a clean "memory card" image (monospace panel + header strip)
4. Stores BOTH the rendered image AND the original raw text

This removes friction (no manual screenshots) while keeping vision compression benefits (~7-20x token savings).

**Key Philosophy (THE-FUTURE.md):**
- **Intentional checkpoints**, not firehose recording
- **Metadata discipline** - strict schema, all fields always present (null/[] if unknown)
- **Query metadata first** - jira/keywords/module_scope matches before fulltext
- **Local-first, opt-in recall** - runs locally, no silent remote pushing
- **Aging/condensation** - merge old frames into summaries, archive cold data

## Epic Overview

- **Epic 1:** Frame Storage Infrastructure (5 issues) - Core tables, renderer, insert/retrieval tools
- **Epic 2:** Metadata Discipline & Keyword Generation (4 issues) - Extraction rules, lex-map integration, smart search
- **Epic 3:** VS Code Plugin / Integration (4 issues) - `/remember` and `/recall` commands
- **Epic 4:** Frame Lifecycle – Aging & Condensation (3 issues) - Summary frames, cold archive
- **Epic 5:** Retrieval Quality & UX (3 issues) - Fuzzy search, semantic search (v2), deduplication
- **Epic 6:** Documentation & Examples (4 issues) - User guide, API reference, integrations, security
- **Epic 7:** Performance & Scale (3 issues) - Benchmarks, query optimization, compression

**Total: 7 Epics, 26 Issues**

## Current State (✅ Done)
- [x] MCP server over stdio (not HTTP)
- [x] Local SQLite storage
- [x] Environment-based config (`LEXBRAIN_DB`, `LEXBRAIN_MODE`)
- [x] VS Code / Copilot integration ready
- [x] `thought_put`, `thought_get`, `thought_lock`, `thought_unlock` tools

## Roadmap to MVP

### Epic 1: Frame Storage Infrastructure

**Goal:** Build the core Frames table and API so we can store + retrieve auto-generated visual snapshots.

#### Issue 1.1: Design Frame schema
- [ ] **Type:** Task
- [ ] **Description:**
  - Define SQLite schema for Frames with **strict metadata discipline**:
    - Core fields: `frame_id`, `timestamp` (ISO8601), `branch`, `jira[]`, `feature_flags[]`, `module_scope[]`
    - Rich metadata: `summary_caption`, `keywords[]`, `status_snapshot` (tests_failing, merge_blockers, next_action)
    - Storage: rendered image blob, raw text payload(s)
  - **Key principle:** All metadata fields always present (use `null` or `[]` if unknown) — no shape mutations
  - Plan dual-storage strategy (image for recall, text for search/exact retrieval)
  - Design separate metadata table for fast indexed queries (branch, jira, module_scope)
  - Add migration strategy for future schema changes
- [ ] **Acceptance criteria:**
  - Schema documented in `docs/FRAME-SCHEMA.md` with full metadata field descriptions
  - Example Frame JSON matches THE-FUTURE.md spec (TICKET-123 auth handshake example)
  - SQLite migration script ready
  - Metadata indexes on: jira, branch, feature_flags, module_scope, timestamp
  - Schema handles 1000+ frames without performance degradation
  - Supports both image and text storage per frame

#### Issue 1.2: Implement text-to-image renderer
- [ ] **Type:** Feature
- [ ] **Description:**
  - Build renderer that takes text (logs, errors, stack traces, merge plans) and generates "memory card" image
  - Render as monospace panel with minimal syntax/ANSI coloring
  - Add **metadata header strip** containing:
    - timestamp, branch, Jira key(s)
    - test status (e.g., "2 failing")
    - quick context snippet
  - Output: clean, high-contrast PNG optimized for vision-capable LLMs
  - **Not** a desktop screenshot — a legible artifact designed for efficient recall
  - Library choice: node-canvas, Puppeteer headless, or similar
- [ ] **Acceptance criteria:**
  - Can render 500+ lines of text as readable image
  - Header strip shows: timestamp, branch, jira, test count
  - Output < 1MB per image
  - Supports ANSI color codes (basic terminal styling)
  - Optional line numbers for code/stack traces

#### Issue 1.3: Implement Frame insert (`thought_remember`)
- [ ] **Type:** Feature
- [ ] **Description:**
  - Extend MCP server with `thought_remember` tool implementing the **capture pipeline** from THE-FUTURE.md:
    1. Accept source text blocks (test output, stack traces, diff/plan summary, user notes)
    2. Detect context: git branch, Jira key(s), feature flags, module scope
    3. Render "memory card" image using renderer from 1.2
    4. Generate metadata: `summary_caption`, `keywords[]`, `status_snapshot`
    5. Persist: image, raw text, metadata together
  - Accept: `text_content[]`, optional `caption`, optional `tags[]`, optional `context` JSON
  - **Auto-detect metadata** from text:
    - Jira keys via regex (`[A-Z]+-\d+`)
    - Git branch from context or git commands in text
    - Test status from keywords ("2 failing", "✓ 15 passed")
    - Module scope from file paths in stack traces
    - Feature flags from context JSON
  - **Human caption** (optional but gold): User-provided short description saved in `summary_caption` AND added to `keywords`
  - Store BOTH rendered image + source text in DB
  - Return frame_id on success
- [ ] **Acceptance criteria:**
  - Tool callable via MCP
  - Frames persist to SQLite with both image and text
  - Auto-detection works for common patterns (TICKET-12345, "2 failing", branch names, module paths)
  - Human caption properly integrated into metadata
  - Metadata always includes: timestamp, branch, jira, keywords (even if some are `null`/`[]`)
  - Frame IDs deterministic (aid caching/dedup)

#### Issue 1.4: Implement Frame retrieval / search (`thought_recap`)
- [ ] **Type:** Feature
- [ ] **Description:**
  - Extend MCP server with `thought_recap` tool
  - Accept: `query` string (free-text or tag-based)
  - **Query metadata first, NOT fulltext** (as specified in THE-FUTURE.md section 3):
    - Match `jira` field (e.g., "TICKET-123")
    - Match `keywords` array (e.g., "Add User disabled", "UserAccessController")
    - Match `module_scope` array (e.g., "ui/user-admin-panel")
  - Fallback: Full-text search on stored raw text
  - Rank by recency within matched set
  - Return: Top N Frames (usually 1-3, newest-first) with:
    - rendered image(s)
    - summary_caption
    - timestamp
    - branch
    - status_snapshot.next_action
    - (optionally) raw text as fallback for exact wording/code
  - Implement search: metadata match → text search → recency fallback
- [ ] **Acceptance criteria:**
  - Tool callable via MCP
  - Returns frames in relevance order (metadata matches prioritized)
  - Query "TICKET-123" returns all frames with that jira tag
  - Query "Add User" matches keywords/module_scope
  - Handles partial tag matches (e.g., "TICKET-12" matches "TICKET-123")
  - Limits results to N=4 by default, configurable
  - Returns enough context for assistant to "pick up where we left off"

#### Issue 1.5: Image storage & serving
- [ ] **Type:** Task
- [ ] **Description:**
  - Decide on image storage strategy (SQLite BLOB recommended for simplicity)
  - Implement path/data abstraction for portability
  - Add compression strategy (PNG → WebP with acceptable quality loss)
  - Document in `docs/IMAGE-STORAGE.md`
- [ ] **Acceptance criteria:**
  - Rendered images persist durably in SQLite
  - Images returned from `thought_recap` (base64 encoded or URI)
  - Storage < 1MB per frame (average)
  - Can optionally return raw text instead of image for token efficiency

---

### Epic 2: Metadata Discipline & Keyword Generation

**Goal:** Ensure consistent, searchable metadata on every Frame. This is what makes recall work.

#### Issue 2.1: Implement metadata extraction rules (THE-FUTURE.md section 5)
- [ ] **Type:** Feature
- [ ] **Description:**
  - Implement **standardized metadata field extraction** per THE-FUTURE.md:
    - `timestamp`: ISO8601 with local offset (auto)
    - `branch`: full branch name from git (auto)
    - `jira`: extract all `[A-Z]+-\d+` patterns from branch/caption/text
    - `feature_flags`: from context JSON or keywords in text
    - `module_scope`: extract from file paths in stack traces, map to lex-map canonical identifiers
    - `summary_caption`: user-provided OR auto-generate from first error line
    - `status_snapshot`: parse from text:
      - `tests_failing`: detect from "2 failing", "3 tests failed"
      - `merge_blockers`: detect from keywords or user input
      - `next_action`: user-provided or inferred from context
      - `keywords[]`: **flattened array of searchable tokens** including:
      - jira keys (always)
      - branch name (always)
      - class/controller names from stack traces
      - main error strings ("auth handshake timeout", "Add User disabled")
      - feature flag names
      - architectural terms from lex-map ("services/auth-core", "UserAccessController")
  - **Critical rule:** If field unknown, set to `null` or `[]` — never omit fields
  - Store in indexed metadata table for fast queries
  - Support manual override via `context` JSON parameter
  - Extract during `thought_remember` before rendering
- [ ] **Acceptance criteria:**
  - Auto-detects Jira keys from logs/errors
  - Auto-detects test failures from pytest/jest output
  - Manual context overrides auto-detection
  - Metadata queries < 50ms
  - Handles missing/incomplete context gracefully

#### Issue 2.2: Implement lex-map integration for module_scope
- [ ] **Type:** Feature
- [ ] **Description:**
  - Integrate with lex-map to map file paths → canonical module identifiers
  - Extract file paths from:
    - Stack traces
    - Test output
    - Git diff summaries
  - Query lex-map (or local cache) to resolve paths like:
    - `services/auth-core/AuthClient.ts` → `"services/auth-core"`
    - `ui/user-admin-panel/UserAccessController.ts` → `"ui/user-admin-panel"`
  - Store in `module_scope[]` field
  - This is the **bridge between LexBrain (temporal state) and lex-map (structural truth)**
- [ ] **Acceptance criteria:**
  - File paths in stack traces auto-resolve to module_scope
  - Integration with lex-map documented
  - Fallback: if lex-map unavailable, use file path prefixes as scope
  - Module scope searchable in `thought_recap` queries

#### Issue 2.3: Smart search (metadata-first hybrid)
- [ ] **Type:** Feature
- [ ] **Description:**
  - Implement **metadata-first search** as specified in THE-FUTURE.md section 3:
    - Priority 1: Match jira, module_scope, feature_flags (indexed fields)
    - Priority 2: Match keywords array
    - Priority 3: Full-text search on stored raw text
    - Priority 4: Fuzzy match on captions
  - Rank by recency within matched set
  - Return top N with relevance scores
- [ ] **Acceptance criteria:**
  - "TICKET-123" query finds all frames tagged with that Jira key (metadata match)
  - "services/auth-core" finds frames in that module_scope
  - "auth timeout" searches keywords first, then raw text
  - "merge conflict" finds frames with similar captions
  - Results are ranked (metadata matches > keyword > text > caption)
  - Handles 100K+ frames without timeout
  - Metadata queries < 50ms

#### Issue 2.4: Context hooks for CI/merge-weave integration
- [ ] **Type:** Task
- [ ] **Description:**
  - Document how to populate `context` JSON with lex-pr-runner data (merge order, blocked PRs, etc.)
  - Create example payloads showing full metadata structure
  - Show how to pass feature flag state, CI status into frames
  - Design for future: how would CI failures auto-create frames?
- [ ] **Acceptance criteria:**
  - `docs/INTEGRATION-HOOKS.md` written
  - Example payloads match THE-FUTURE.md metadata spec
  - Schema forwards-compatible with future integrations

---

### Epic 3: VS Code Plugin / Integration

**Goal:** Make it trivial to capture context from within VS Code with `/remember`.

#### Issue 3.1: VS Code extension scaffolding
- [ ] **Type:** Feature
- [ ] **Description:**
  - Create minimal VS Code extension repo (separate from lexbrain-mcp)
  - Depend on lexbrain-mcp MCP server
  - Implement: `/remember` command in Copilot chat
- [ ] **Acceptance criteria:**
  - Extension loads in VS Code
  - Can invoke MCP server commands
  - No errors in console

#### Issue 3.2: Context capture & caption UI
- [ ] **Type:** Feature
- [ ] **Description:**
  - On `/remember` command:
    - Capture current Copilot chat context (last N messages, errors shown, terminal output)
    - Extract text content (logs, stack traces, test failures)
    - Prompt user for caption (or auto-generate from first error line)
    - Auto-detect tags (branch from git, Jira from chat context, test status from output)
    - Send to lexbrain via `thought_remember` MCP tool
  - LexBrain auto-renders the text as a memory card image
- [ ] **Acceptance criteria:**
  - Chat context is captured as text
  - User prompted for caption (with smart default)
  - Tags are auto-detected and shown to user (allow override)
  - Frame stored in LexBrain after confirmation
  - Success notification shown

#### Issue 3.3: Quick `/remember` shortcut
- [ ] **Type:** Feature
- [ ] **Description:**
  - Add streamlined `/remember` flow with no dialogs
  - Uses auto-detected caption (branch + first error line) and tags
  - One-second flow for checkpoint memory
- [ ] **Acceptance criteria:**
  - Command works in Copilot chat
  - Frame captured and stored in < 2 seconds
  - No modal dialogs (non-blocking)
  - Shows brief toast notification on success

#### Issue 3.4: `/recall` command integration
- [ ] **Type:** Feature
- [ ] **Description:**
  - Add slash command in Copilot chat: `/recall [query]`
  - On invoke: call `thought_recap` with query, fetch top 3-4 matching frames
  - Display in chat:
    - Frame captions + rendered images
    - timestamp, branch, status_snapshot.next_action
    - Optionally show raw text on click/expand
  - Inject frames into chat preamble for next model request
  - **Goal:** Assistant operates like "I was literally there yesterday" (THE-FUTURE.md section 4)
- [ ] **Acceptance criteria:**
  - `/recall TICKET-123` shows frames for that ticket
  - Frames display with rendered images + metadata
  - Frames appear as context in next model request
  - User can accept/reject frames before sending
  - Assistant can answer "what was blocking Add User button?" from frame data

---

### Epic 4: Frame Lifecycle – Aging & Condensation

**Goal:** Implement condensation and archival (THE-FUTURE.md section 6) to keep DB size sane while preserving narrative.

#### Issue 4.1: Design condensation strategy
- [ ] **Type:** Task
- [ ] **Description:**
  - Document **condensation** logic:
    - Merge multiple Frames for same ticket/branch/module over several days into "Summary Frame"
    - Summary Frame contains:
      - 1 composite rendered image (key failures/blockers/decisions)
      - Union of keywords and metadata
      - References to original granular frames (for audit)
    - Mark older granular Frames as "archived" so retrieval favors summary
  - Document **cold archive** logic:
    - After N days (configurable), mark old Frames read-only
    - Keep: rendered image, metadata, compressed summary of text
    - Discard: full raw text (unless flagged as important)
  - **Result:** Preserve narrative without hoarding every 500-line stack trace forever
- [ ] **Acceptance criteria:**
  - `docs/CONDENSATION.md` written
  - Condensation rules defined (e.g., merge frames > 7 days old, same jira/branch)
  - Cold archive rules defined (e.g., archive frames > 30 days old)
  - Schema supports `archived` flag and `summary_frame_id` reference

#### Issue 4.2: Implement Summary Frame generation
- [ ] **Type:** Feature
- [ ] **Description:**
  - Tool or background job to condense multiple related frames:
    - Find frames matching: same jira + same branch + within time window
    - Extract common patterns (recurring errors, key decisions)
    - Generate composite rendered image showing evolution
    - Create Summary Frame with union of all keywords/metadata
    - Mark original frames as archived (still queryable but lower priority)
- [ ] **Acceptance criteria:**
  - Can generate Summary Frame from 5+ related frames
  - Summary preserves key information (main blockers, decisions, next actions)
  - Original frames still accessible if needed
  - Retrieval favors Summary Frame over archived granular frames

#### Issue 4.3: Implement cold archive
- [ ] **Type:** Feature
- [ ] **Description:**
  - Background job to archive old frames (configurable threshold, e.g., 30 days)
  - Keep: rendered image, all metadata, compressed text summary
  - Discard: full raw text (unless frame marked as "important")
  - Archived frames still searchable and retrievable
  - Measure storage savings
- [ ] **Acceptance criteria:**
  - Old frames automatically archived on schedule
  - Archived frames still appear in search results
  - Rendered images preserved indefinitely
  - Storage footprint reduced by 50%+ for old frames
  - User can manually flag frames as "important" to prevent text deletion

---

### Epic 5: Retrieval Quality & UX

**Goal:** Make recall feel natural and accurate.

#### Issue 5.1: Fuzzy search scoring for captions
- [ ] **Type:** Task
- [ ] **Description:**
  - Evaluate & implement fuzzy search library (e.g., fuse.js for JS, or custom Levenshtein)
  - Tune scoring for caption matching (captions are auto-generated, may vary slightly)
  - Test on 100+ frames with real queries
- [ ] **Acceptance criteria:**
  - Queries return relevant frames in top 3
  - No false positives in top 5
  - Scoring is configurable

#### Issue 5.2: Semantic search (optional v2)
- [ ] **Type:** Task (v2, not MVP)
- [ ] **Description:**
  - Plan for embedding-based search on raw text (use Claude / OpenAI / local embeddings?)
  - Document design in `docs/SEMANTIC-SEARCH.md`
  - Defer implementation to v2
  - Would enable "similar error" queries without exact keyword match
- [ ] **Acceptance criteria:**
  - Design doc complete
  - Tech choices justified
  - Privacy implications documented (local vs cloud embeddings)

#### Issue 5.3: Frame deduplication
- [ ] **Type:** Feature
- [ ] **Description:**
  - If two frames have identical raw text + same tags, dedupe them
  - Keep latest caption/timestamp
  - Avoid storing duplicate images
  - Log dedupe events
  - **Note:** Condensation (Epic 4) handles multi-frame summarization; this handles exact duplicates
- [ ] **Acceptance criteria:**
  - Duplicate frames are detected and merged
  - User can see how many frames were deduplicated
  - Storage footprint reduced by 20%+ in tests

---

### Epic 6: Documentation & Examples

**Goal:** Make it easy for users to get started.

#### Issue 6.1: User guide for frame capture workflow
- [ ] **Type:** Documentation
  - **Description:**
  - Write `docs/USER-GUIDE.md`
  - Show: install extension → use `/remember` → ask Copilot → recall frames with `/recall`
  - Explain **checkpoint memory philosophy** from THE-FUTURE.md:
    - Intentional checkpoints, not firehose
    - Good moments: actionable debug results, end-of-session, before branch switch
  - Show how frames are auto-rendered from text (not screenshots)
  - Include example rendered memory cards
  - Show example query: "Pick up TICKET-123 where we left off"
- [ ] **Acceptance criteria:**
  - Guide is complete and clear
  - Includes at least 3 real-world examples matching THE-FUTURE.md scenarios
  - Commands documented: `/remember`, `/recall [query]`
  - Philosophy section explains "meaningful unit of work" checkpoint concept

#### Issue 6.2: API reference for `thought_remember` and `thought_recap`
- [ ] **Type:** Documentation
- [ ] **Description:**
  - Document full schema for frame objects matching THE-FUTURE.md metadata spec
  - Include examples of `thought_remember` payloads (text input, auto-detected metadata)
  - Show full metadata structure from THE-FUTURE.md (timestamp, branch, jira, feature_flags, module_scope, status_snapshot, keywords)
  - Show `thought_recap` response format (images, captions, timestamps, tags)
  - Error cases and handling
- [ ] **Acceptance criteria:**
  - API doc is complete and accurate
  - Every metadata field described with data type and purpose
  - Example MCP tool calls provided
  - Matches THE-FUTURE.md metadata specification exactly

#### Issue 6.3: Integration examples with lex-pr-runner
- [ ] **Type:** Documentation
- [ ] **Description:**
  - Show how to pass merge-weave state into frame `context` JSON
  - Example: "Frame captured when PR dependency graph had 3 blocked PRs"
  - Document how `status_snapshot.merge_blockers` integrates with lex-pr-runner output
  - Plan for future: how would CI failures auto-create frames?
- [ ] **Acceptance criteria:**
  - Example JSON payloads provided matching THE-FUTURE.md metadata
  - Documented how to hook into lex-pr-runner output
  - Future integration points identified

#### Issue 6.4: Security & privacy documentation
- [ ] **Type:** Documentation
- [ ] **Description:**
  - Document LexBrain's **local-first, opt-in recall** model (THE-FUTURE.md section 7)
  - Explain: runs locally, no default HTTP server, MCP stdio only
  - Frames only emitted when explicitly requested via `thought_recap`
  - No silent remote pushing
  - **Selling point:** "Never feels like spyware" for team adoption
- [ ] **Acceptance criteria:**
  - `docs/SECURITY.md` written
  - Privacy guarantees documented
  - Data storage location documented (`/srv/lex-brain/thoughts.db` or similar)
  - MCP stdio security model explained

---

### Epic 7: Performance & Scale

**Goal:** Ensure LexBrain stays fast at 1000+ frames.

#### Issue 7.1: Benchmarking suite
- [ ] **Type:** Task
- [ ] **Description:**
  - Create test suite: insert 1000 frames with realistic metadata
  - Test queries matching THE-FUTURE.md scenarios:
    - "TICKET-123" (jira match)
    - "Add User" (keyword match)
    - "services/auth-core" (module_scope match)
  - Measure latency (target: metadata query < 50ms at 1000 frames)
  - Test image rendering performance (target: < 500ms per frame)
  - Document bottlenecks
- [ ] **Acceptance criteria:**
  - Benchmark script runnable
  - Latency targets documented
  - Results tracked over releases
  - Tests cover all metadata query types

#### Issue 7.2: Query optimization
- [ ] **Type:** Task
- [ ] **Description:**
  - Add database indexes on **all metadata fields** per THE-FUTURE.md section 5:
    - `timestamp`, `branch`, `jira[]`, `feature_flags[]`, `module_scope[]`
  - Add full-text search index on `keywords[]` array
  - Add full-text search index on raw text column (fallback)
  - Evaluate pagination for large result sets
  - Profile slow queries
  - **Goal:** Metadata queries < 50ms (THE-FUTURE.md section 3)
- [ ] **Acceptance criteria:**
  - Queries stay < 50ms at 1000 frames for metadata matches
  - Full-text search < 100ms at 1000 frames
  - No N+1 query patterns
  - Indexes chosen based on profiling data
  - Array field indexing works correctly (jira, feature_flags, module_scope, keywords)

#### Issue 7.3: Image compression & storage optimization
- [ ] **Type:** Feature
- [ ] **Description:**
  - Implement image compression (WebP) at rendering time
  - Target: 500KB per frame average with compression
  - Measure storage savings
  - **Note:** Archival handled by Epic 4 (condensation/cold archive)
- [ ] **Acceptance criteria:**
  - Rendered images are compressed at capture
  - Compression ratio is 3:1 or better (vs uncompressed PNG)
  - Image quality suitable for vision model consumption
  - Storage < 1MB per frame

---

## Phase 2 (Future, not MVP)

These are interesting but not required for MVP. They are listed here for planning:

- **Semantic search:** Use embeddings for better recall on raw text
- **Multi-device sync:** Cloud-optional sync for team contexts (Jira-aware, PR shared)
- **CI integration:** Auto-capture frames on test failures (GitHub Actions, Jenkins hooks)
- **Feature flag context:** Ingest feature flag state from services
- **Merge-weave tighter integration:** Auto-populate frame context from lex-pr-runner data
- **Export/reporting:** Summarize "what happened this sprint" from frames
- **Vision model fine-tuning:** Optimize for reading rendered memory cards

---

## Issue Creation Template

For each issue, use this template on GitHub:

```markdown
## Issue Title
[From PATH-TO-THE-FUTURE.md, Epic X, Issue X.Y]

**Type:** Feature / Task / Documentation / Bug

**Description:**
[Copy from roadmap]

**Acceptance Criteria:**
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

**Dependencies:**
- [ ] Issue X.Y (if any)

**Estimated effort:** S / M / L

**Labels:** `epic:X`, `frame-storage` / `context` / `vs-code` / etc.
```

---

## Priority Order for Execution

1. **Epic 1** (Frame Storage) – Core functionality
2. **Epic 2** (Context Awareness) – Makes frames useful
3. **Epic 3** (VS Code Plugin) – User-facing, makes adoption frictionless
4. **Epic 4** (Retrieval Quality) – Tuning for great UX
5. **Epic 5** (Documentation) – Ship with docs
6. **Epic 6** (Performance) – Verify scales

---

## Success Metrics

When complete, LexBrain MVP is successful if:

1. User can capture frames with a keybinding (Ctrl+Alt+L)
2. User can ask Copilot "remind me of my work on TICKET-123" and get 3–4 relevant frames back
3. Frame recall works at 100+ frames with < 100ms latency
4. Zero data loss on process crash / exit
5. Setup is 5 minutes: add extension to VS Code, set `LEXBRAIN_DB` env var, done

---

## Links & References

- Vision: `docs/THE-FUTURE.md`
- Frame schema: `docs/FRAME-SCHEMA.md` (to be created)
- Image storage: `docs/IMAGE-STORAGE.md` (to be created)
- Integration: `docs/INTEGRATION-HOOKS.md` (to be created)
- User guide: `docs/USER-GUIDE.md` (to be created)
- API reference: `docs/API-REFERENCE.md` (to be created)
