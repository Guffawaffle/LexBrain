# Mind Palace Architecture

## Overview

This document describes the technical architecture of the Mind Palace system, including reference point storage, Atlas Frame generation, LexMap integration, and recall implementation.

**Target audience:** Developers extending or maintaining LexBrain and LexMap.

## System Architecture

The Mind Palace system is a **cross-repository feature** spanning LexBrain and LexMap:

```
┌─────────────────────────────────────────────────────────────┐
│                        Mind Palace                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────┐              ┌──────────────────┐   │
│  │    LexBrain      │              │     LexMap       │   │
│  │                  │              │                  │   │
│  │ - Store Frames   │◄─────────────┤ - Module coords  │   │
│  │ - Reference pts  │  Query       │ - Adjacency      │   │
│  │ - Atlas Frames   │              │ - Policy rules   │   │
│  │ - Recall API     │──────────────►│ - Fold logic    │   │
│  │                  │  Generate    │                  │   │
│  └──────────────────┘  Atlas Frame └──────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Key Components

1. **Reference Point Storage** (LexBrain)
   - Extends Frame metadata schema
   - Indexes reference points for fuzzy search
   - Links reference points to Atlas Frames

2. **Atlas Frame Generator** (LexMap)
   - Computes module neighborhoods
   - Applies fold radius logic
   - Exports adjacency graph slices

3. **Atlas Frame Storage** (LexBrain)
   - Stores Atlas Frame JSON alongside Frames
   - Links Atlas Frames to parent Frames
   - Handles stale Atlas Frame cleanup

4. **Recall API** (LexBrain MCP)
   - Fuzzy matching on reference points
   - Returns Frame + Atlas Frame
   - Falls back to keyword search

## LexMap Integration Points

### 1. Module Coordinates

LexMap's `lexmap.policy.json` must include coordinates for each module:

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
    }
  ]
}
```

**Requirements:**
- Coordinates must be unique per module
- Coordinates enable distance calculations for fold radius
- Layer names must follow: `presentation`, `application`, `domain`, `infrastructure`

### 2. Adjacency Graph Export

LexMap exposes an API to generate adjacency graphs:

```bash
lexmap export-adjacency \
  --reference-module ui/user-admin-panel \
  --fold-radius 1 \
  --output atlas-frame.json
```

**Output format:**

```json
{
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
    }
  ],
  "edges": [
    {
      "from": "ui/user-admin-panel",
      "to": "services/user-access-api",
      "allowed": true
    }
  ]
}
```

### 3. Policy Rule Resolution

LexMap determines which edges are allowed/forbidden:

```typescript
// LexMap API
interface PolicyCheck {
  from: string;      // Module ID
  to: string;        // Module ID
  allowed: boolean;  // Policy verdict
  rule?: string;     // Which rule applies
}

function checkEdge(from: string, to: string): PolicyCheck;
```

LexBrain calls this when generating Atlas Frames to mark forbidden edges.

## LexBrain Storage Model

### Frame Metadata Extension

Reference points are added to the existing Frame metadata schema:

**Before (baseline LexBrain):**

```json
{
  "timestamp": "2025-11-01T22:30:00Z",
  "branch": "feature/TICKET-123",
  "jira": ["TICKET-123"],
  "module_scope": ["ui/user-admin-panel"],
  "summary_caption": "...",
  "status_snapshot": {...},
  "keywords": [...]
}
```

**After (with Mind Palace):**

```json
{
  "timestamp": "2025-11-01T22:30:00Z",
  "branch": "feature/TICKET-123",
  "jira": ["TICKET-123"],
  "reference_point": "Add User button still disabled",  // NEW
  "module_scope": ["ui/user-admin-panel"],
  "atlas_frame_id": "atlas_xyz789",                     // NEW
  "summary_caption": "...",
  "status_snapshot": {...},
  "keywords": [...]
}
```

### Atlas Frame Storage

Atlas Frames are stored separately but linked to Frames:

**Database schema:**

```sql
CREATE TABLE atlas_frames (
  atlas_frame_id TEXT PRIMARY KEY,
  frame_id TEXT NOT NULL,
  atlas_timestamp TEXT NOT NULL,
  reference_module TEXT NOT NULL,
  fold_radius INTEGER NOT NULL,
  atlas_json TEXT NOT NULL,  -- Full Atlas Frame JSON
  created_at TEXT NOT NULL,
  FOREIGN KEY (frame_id) REFERENCES frames(frame_id)
);

CREATE INDEX idx_atlas_frames_frame_id ON atlas_frames(frame_id);
CREATE INDEX idx_atlas_frames_timestamp ON atlas_frames(atlas_timestamp);
```

**Why separate tables?**
- Atlas Frames can be large (many modules + edges)
- Not every Frame needs an Atlas Frame (only if LexMap is configured)
- Enables efficient garbage collection of stale Atlas Frames

### Reference Point Indexing

To enable fuzzy search, reference points are indexed:

```sql
CREATE TABLE reference_points (
  reference_point_id TEXT PRIMARY KEY,
  frame_id TEXT NOT NULL,
  reference_text TEXT NOT NULL,
  normalized_text TEXT NOT NULL,  -- Lowercased, stemmed for search
  created_at TEXT NOT NULL,
  FOREIGN KEY (frame_id) REFERENCES frames(frame_id)
);

CREATE INDEX idx_reference_points_normalized ON reference_points(normalized_text);
CREATE INDEX idx_reference_points_frame_id ON reference_points(frame_id);
```

**Normalization:**
- Lowercase
- Remove punctuation
- Simple stemming (e.g. "disabled" → "disabl")

This enables queries like:
- "Add User button" matches "add user button still disabled"
- "auth timeout" matches "Auth handshake timeout issue"

## Atlas Frame Generation Process

### High-Level Flow

```
1. Developer calls `/remember` with --reference-point
2. LexBrain captures Frame (existing flow)
3. LexBrain identifies reference module from module_scope[0]
4. LexBrain calls LexMap API: export-adjacency
5. LexMap computes neighborhood with fold radius
6. LexMap returns Atlas Frame JSON
7. LexBrain stores Atlas Frame in atlas_frames table
8. LexBrain links Atlas Frame to Frame via atlas_frame_id
```

### Step-by-Step Detail

#### Step 1: Capture Reference Point

```bash
lexbrain remember \
  --jira TICKET-123 \
  --reference-point "Add User button still disabled" \
  --module-scope ui/user-admin-panel \
  --summary "..."
```

#### Step 2: Identify Reference Module

```typescript
// LexBrain logic
const referenceModule = frameMetadata.module_scope[0];
// → "ui/user-admin-panel"
```

**Convention:** The **first module** in `module_scope` is the reference module (the one you were primarily working in).

#### Step 3: Call LexMap API

```typescript
const atlasFrame = await lexmap.exportAdjacency({
  referenceModule: "ui/user-admin-panel",
  foldRadius: 1,
  includeCoordinates: true,
  includePolicyRules: true
});
```

#### Step 4: LexMap Computes Neighborhood

LexMap's fold logic:

1. Start with reference module
2. Find all modules within `foldRadius` hops (graph distance)
3. For each edge in the subgraph, check policy (allowed/forbidden)
4. Return module list + edge list + coordinates

**Fold radius logic:**

```typescript
// Pseudo-code
function computeNeighborhood(
  referenceModule: string, 
  foldRadius: number
): AtlasFrame {
  const modules = new Set([referenceModule]);
  const edges = [];
  
  let currentHop = [referenceModule];
  
  for (let hop = 0; hop < foldRadius; hop++) {
    const nextHop = [];
    
    for (const module of currentHop) {
      const neighbors = graph.getNeighbors(module);
      
      for (const neighbor of neighbors) {
        if (!modules.has(neighbor.id)) {
          modules.add(neighbor.id);
          nextHop.push(neighbor.id);
        }
        
        edges.push({
          from: module,
          to: neighbor.id,
          allowed: policy.checkEdge(module, neighbor.id)
        });
      }
    }
    
    currentHop = nextHop;
  }
  
  return {
    reference_module: referenceModule,
    fold_radius: foldRadius,
    modules: Array.from(modules).map(id => ({
      id,
      coordinates: policy.getCoordinates(id),
      layer: policy.getLayer(id)
    })),
    edges
  };
}
```

#### Step 5: Store Atlas Frame

```typescript
// LexBrain storage
const atlasFrameId = generateId("atlas");

db.insertAtlasFrame({
  atlas_frame_id: atlasFrameId,
  frame_id: frameId,
  atlas_timestamp: new Date().toISOString(),
  reference_module: atlasFrame.reference_module,
  fold_radius: atlasFrame.fold_radius,
  atlas_json: JSON.stringify(atlasFrame)
});

// Link to Frame
db.updateFrame(frameId, {
  atlas_frame_id: atlasFrameId
});
```

## Fold Radius and Adjacency Logic

### Why Fold Radius?

The fold radius prevents **context explosion** by limiting how far we expand from the reference module.

**Without fold radius:**
- Reference: `ui/user-admin-panel`
- Expansion: All modules transitively reachable
- Result: Potentially 100+ modules, thousands of tokens

**With fold radius = 1:**
- Reference: `ui/user-admin-panel`
- Expansion: Direct neighbors only
- Result: ~5-10 modules, manageable token cost

### Choosing Fold Radius

| Radius | Modules Included | Use Case |
|--------|------------------|----------|
| 0 | Reference only | Just confirming which module you're in |
| 1 | Reference + direct neighbors | **Default** - best balance |
| 2 | Reference + 2-hop neighborhood | Complex multi-module reasoning |
| 3+ | Large subgraph | Rare - usually too much context |

**Recommendation:** Start with radius 1. Only increase if reasoning requires it.

### Adjacency Graph Structure

The adjacency graph is **directed**:

```
ui/user-admin-panel → services/user-access-api   (allowed)
ui/user-admin-panel → services/auth-core          (forbidden)
```

**Why include forbidden edges?**

Forbidden edges are critical for explaining blockers:

> "The Add User button is disabled because `ui/user-admin-panel` was trying to call `services/auth-core`, which is forbidden. The allowed path is through `user-access-api`."

Without forbidden edges in the Atlas Frame, the assistant can't explain **why** something doesn't work.

### Distance Calculation

Distance between modules uses Euclidean distance on coordinates:

```typescript
function distance(coord1: {x: number, y: number}, coord2: {x: number, y: number}): number {
  return Math.sqrt(
    Math.pow(coord2.x - coord1.x, 2) + 
    Math.pow(coord2.y - coord1.y, 2)
  );
}
```

**Why coordinates matter:**
- Enable visual rendering (future UI)
- Support spatial queries ("modules near X")
- Provide intuitive "closeness" metric

## Recall Implementation

### MCP Tool Definition

```typescript
// packages/mcp/src/tools/recall.ts
{
  name: "thought_recall",
  description: "Recall work context by reference point, returning Frame + Atlas Frame",
  inputSchema: {
    type: "object",
    properties: {
      reference_point: {
        type: "string",
        description: "Human-memorable anchor phrase (fuzzy matched)"
      },
      jira: {
        type: "string",
        description: "Alternative: recall by ticket ID"
      },
      frame_id: {
        type: "string",
        description: "Alternative: recall specific Frame by ID"
      }
    }
  }
}
```

### Recall Logic

```typescript
async function recall(params: {
  reference_point?: string;
  jira?: string;
  frame_id?: string;
}): Promise<RecallResult> {
  
  let frame: Frame;
  
  // Priority: frame_id > reference_point > jira
  if (params.frame_id) {
    frame = db.getFrameById(params.frame_id);
  } 
  else if (params.reference_point) {
    // Fuzzy match on reference point
    const normalized = normalize(params.reference_point);
    const matches = db.searchReferencePoints(normalized);
    
    if (matches.length === 0) {
      // Fallback: keyword search
      frame = db.searchFramesByKeyword(params.reference_point)[0];
    } else {
      // Return most recent match
      frame = matches.sort((a, b) => 
        b.timestamp.localeCompare(a.timestamp)
      )[0];
    }
  }
  else if (params.jira) {
    const frames = db.getFramesByJira(params.jira);
    frame = frames[frames.length - 1]; // Most recent
  }
  
  if (!frame) {
    throw new Error("No matching Frame found");
  }
  
  // Fetch linked Atlas Frame if exists
  let atlasFrame: AtlasFrame | null = null;
  if (frame.atlas_frame_id) {
    atlasFrame = db.getAtlasFrame(frame.atlas_frame_id);
  }
  
  return {
    frame,
    atlas_frame: atlasFrame
  };
}
```

### Fuzzy Matching Algorithm

```typescript
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')  // Remove punctuation
    .trim()
    .split(/\s+/)
    .map(stem)                // Simple stemming
    .join(' ');
}

function stem(word: string): string {
  // Very simple stemming - just remove common suffixes
  return word
    .replace(/ing$/, '')
    .replace(/ed$/, '')
    .replace(/s$/, '');
}

function fuzzyMatch(query: string, candidate: string, threshold: number = 0.6): boolean {
  const queryTokens = normalize(query).split(' ');
  const candidateTokens = normalize(candidate).split(' ');
  
  const matches = queryTokens.filter(qt => 
    candidateTokens.some(ct => ct.includes(qt) || qt.includes(ct))
  );
  
  const score = matches.length / queryTokens.length;
  return score >= threshold;
}
```

**Example matches:**

| Query | Stored Reference Point | Match? |
|-------|----------------------|--------|
| "Add User button" | "Add User button still disabled" | ✅ Yes |
| "auth timeout" | "Auth handshake timeout issue" | ✅ Yes |
| "payment" | "Payment gateway integration blocker" | ✅ Yes |
| "user" | "Add User button still disabled" | ⚠️ Weak (might match many) |

## Performance Considerations

### Token Efficiency

**Frame + Atlas Frame vs Full History:**

| Approach | Tokens | Recall Time |
|----------|--------|-------------|
| Full history replay | ~50,000 | ~30s |
| Re-index codebase | ~100,000 | ~60s |
| Frame + Atlas Frame | ~2,000-5,000 | <1s |

**Token breakdown:**
- Frame metadata: ~500 tokens
- Atlas Frame (radius 1, ~10 modules): ~1,500-4,500 tokens
- Total: ~2,000-5,000 tokens

**Compression ratio:** 10-50x better than alternatives.

### Database Indexes

Critical indexes for recall performance:

```sql
-- Fast reference point lookup
CREATE INDEX idx_reference_points_normalized ON reference_points(normalized_text);

-- Fast Frame lookup by ticket
CREATE INDEX idx_frames_jira ON frames(jira);

-- Fast Atlas Frame retrieval
CREATE INDEX idx_atlas_frames_frame_id ON atlas_frames(frame_id);

-- Fast Frame sorting by timestamp
CREATE INDEX idx_frames_timestamp ON frames(timestamp DESC);
```

### Garbage Collection

Old Atlas Frames should be cleaned up to prevent database bloat:

```typescript
// Run periodically (e.g. weekly)
function cleanupStaleAtlasFrames() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90); // 90 days old
  
  db.deleteAtlasFramesOlderThan(cutoff.toISOString());
}
```

**Policy:**
- Keep Atlas Frames for 90 days by default
- Keep Atlas Frames for active tickets indefinitely
- User can configure retention period

### Caching

For frequently recalled Frames, cache Atlas Frames in memory:

```typescript
const atlasFrameCache = new LRU<string, AtlasFrame>({
  max: 100,  // Cache up to 100 Atlas Frames
  ttl: 1000 * 60 * 60  // 1 hour TTL
});
```

## Extension Points for Future Enhancements

### 1. Visual Rendering

Atlas Frames include coordinates - future UI can render them:

```typescript
// Future: packages/ui/src/AtlasFrameRenderer.tsx
function renderAtlasFrame(atlasFrame: AtlasFrame) {
  return (
    <svg width={1000} height={800}>
      {atlasFrame.modules.map(module => (
        <circle 
          cx={module.coordinates.x * 100}
          cy={module.coordinates.y * 100}
          r={30}
          fill={getLayerColor(module.layer)}
        />
      ))}
      {atlasFrame.edges.map(edge => (
        <line
          x1={getModuleCoords(edge.from).x * 100}
          y1={getModuleCoords(edge.from).y * 100}
          x2={getModuleCoords(edge.to).x * 100}
          y2={getModuleCoords(edge.to).y * 100}
          stroke={edge.allowed ? "green" : "red"}
        />
      ))}
    </svg>
  );
}
```

### 2. Multi-Module Reference Points

Currently, reference module is `module_scope[0]`. Future: support multiple reference modules.

```json
{
  "reference_point": "Payment webhook integration",
  "module_scope": [
    "services/payment-gateway",
    "services/webhook-handler"
  ],
  "atlas_frame_references": [
    "services/payment-gateway",
    "services/webhook-handler"
  ]
}
```

Generate Atlas Frame as union of both neighborhoods.

### 3. Temporal Atlas Frames

Track how module relationships evolve:

```json
{
  "reference_point": "Add User button",
  "atlas_frames": [
    {
      "timestamp": "2025-11-01T22:00:00Z",
      "forbidden_edges": ["ui/user-admin-panel → services/auth-core"]
    },
    {
      "timestamp": "2025-11-02T14:00:00Z",
      "forbidden_edges": []  // Fixed!
    }
  ]
}
```

Enables questions like: "When did we fix the forbidden edge?"

### 4. Semantic Reference Point Search

Use embeddings for better fuzzy matching:

```typescript
// Future enhancement
const embedding = await openai.embeddings.create({
  input: params.reference_point,
  model: "text-embedding-3-small"
});

const matches = db.searchReferencePointsByEmbedding(embedding);
```

Enables matches like:
- Query: "user creation blocker"
- Match: "Add User button still disabled" (semantically similar)

### 5. Reference Point Suggestions

Auto-generate reference point suggestions:

```typescript
function suggestReferencePoint(frame: Frame): string[] {
  const suggestions = [];
  
  // Extract from summary
  if (frame.summary_caption.includes("button")) {
    suggestions.push(extractButtonName(frame.summary_caption));
  }
  
  // Extract from blockers
  if (frame.status_snapshot.merge_blockers.length > 0) {
    suggestions.push(frame.status_snapshot.merge_blockers[0]);
  }
  
  return suggestions;
}
```

## THE CRITICAL RULE Enforcement

Mind Palace extends THE CRITICAL RULE:

> **THE CRITICAL RULE:**
> Every module name in `module_scope`, Atlas Frame `modules`, and Atlas Frame `edges` MUST match the module IDs defined in LexMap's `lexmap.policy.json`.

### Validation on Frame Capture

```typescript
async function validateFrameAgainstLexMap(frame: Frame) {
  const lexmapModules = await lexmap.listModules();
  
  for (const moduleId of frame.module_scope) {
    if (!lexmapModules.includes(moduleId)) {
      throw new Error(
        `Module "${moduleId}" not found in LexMap policy. ` +
        `THE CRITICAL RULE: module_scope must use canonical module IDs.`
      );
    }
  }
}
```

### Atlas Frame Validation

```typescript
async function validateAtlasFrame(atlasFrame: AtlasFrame) {
  const lexmapModules = await lexmap.listModules();
  
  // Validate all module IDs in Atlas Frame
  for (const module of atlasFrame.modules) {
    if (!lexmapModules.includes(module.id)) {
      throw new Error(
        `Atlas Frame contains unknown module: "${module.id}"`
      );
    }
  }
  
  // Validate all edge endpoints
  for (const edge of atlasFrame.edges) {
    if (!lexmapModules.includes(edge.from) || !lexmapModules.includes(edge.to)) {
      throw new Error(
        `Atlas Frame contains edge with unknown modules: "${edge.from}" → "${edge.to}"`
      );
    }
  }
}
```

## Error Handling and Fallbacks

### LexMap Unavailable

If LexMap is not configured or unreachable:

```typescript
async function captureFrame(frame: Frame) {
  try {
    // Attempt to generate Atlas Frame
    const atlasFrame = await lexmap.exportAdjacency({
      referenceModule: frame.module_scope[0],
      foldRadius: 1
    });
    
    frame.atlas_frame_id = await storeAtlasFrame(atlasFrame, frame.id);
  } catch (error) {
    console.warn("LexMap unavailable, skipping Atlas Frame generation:", error);
    // Continue without Atlas Frame
  }
  
  await storeFrame(frame);
}
```

**Graceful degradation:**
- Frame is still captured
- Reference point is still stored
- Recall still works (but without Atlas Frame)

### Invalid Coordinates

If module coordinates are missing:

```typescript
function getModuleCoordinates(moduleId: string): {x: number, y: number} {
  const coords = lexmap.getCoordinates(moduleId);
  
  if (!coords) {
    console.warn(`Module "${moduleId}" has no coordinates, using default`);
    return {x: 0, y: 0};  // Default origin
  }
  
  return coords;
}
```

### Stale Policy

If Atlas Frame references modules that no longer exist:

```typescript
async function renderAtlasFrame(atlasFrame: AtlasFrame) {
  const currentModules = await lexmap.listModules();
  
  // Filter out stale modules
  const validModules = atlasFrame.modules.filter(m => 
    currentModules.includes(m.id)
  );
  
  if (validModules.length < atlasFrame.modules.length) {
    console.warn(
      "Atlas Frame contains stale modules. " +
      "Consider recapturing Frame with current policy."
    );
  }
  
  return {
    ...atlasFrame,
    modules: validModules,
    stale: validModules.length < atlasFrame.modules.length
  };
}
```

## Testing Strategies

### Unit Tests

```typescript
describe("Reference Point Fuzzy Matching", () => {
  it("matches exact phrase", () => {
    expect(fuzzyMatch(
      "Add User button",
      "Add User button still disabled"
    )).toBe(true);
  });
  
  it("matches partial phrase", () => {
    expect(fuzzyMatch(
      "auth timeout",
      "Auth handshake timeout issue"
    )).toBe(true);
  });
  
  it("rejects unrelated phrases", () => {
    expect(fuzzyMatch(
      "payment gateway",
      "Add User button still disabled"
    )).toBe(false);
  });
});
```

### Integration Tests

```typescript
describe("Atlas Frame Generation", () => {
  it("generates Atlas Frame with fold radius 1", async () => {
    const frame = await captureFrame({
      reference_point: "Test reference",
      module_scope: ["ui/test-module"],
      ...
    });
    
    const atlasFrame = await getAtlasFrame(frame.atlas_frame_id);
    
    expect(atlasFrame.reference_module).toBe("ui/test-module");
    expect(atlasFrame.fold_radius).toBe(1);
    expect(atlasFrame.modules.length).toBeGreaterThan(0);
  });
});
```

### End-to-End Tests

```bash
# Capture Frame with reference point
lexbrain remember \
  --reference-point "E2E test reference" \
  --module-scope ui/test \
  --summary "Test" \
  --next "Test next"

# Recall by reference point
RESULT=$(lexbrain recall "E2E test reference")

# Verify Frame returned
echo "$RESULT" | jq -e '.frame.reference_point == "E2E test reference"'

# Verify Atlas Frame returned
echo "$RESULT" | jq -e '.atlas_frame != null'
```

## Monitoring and Observability

### Metrics to Track

```typescript
// Prometheus metrics
const recallLatency = new Histogram({
  name: "lexbrain_recall_latency_seconds",
  help: "Time to recall Frame + Atlas Frame",
  labelNames: ["query_type"]  // reference_point, jira, frame_id
});

const atlasFrameSize = new Histogram({
  name: "lexbrain_atlas_frame_size_bytes",
  help: "Size of Atlas Frame JSON",
  buckets: [1000, 5000, 10000, 50000, 100000]
});

const recallMatchRate = new Counter({
  name: "lexbrain_recall_matches_total",
  help: "Number of successful/failed recalls",
  labelNames: ["status"]  // match, no_match, fallback
});
```

### Logging

```typescript
logger.info("Recall request", {
  query_type: "reference_point",
  query_value: params.reference_point,
  match_found: !!frame,
  atlas_frame_included: !!atlasFrame,
  latency_ms: Date.now() - startTime
});
```

## Security Considerations

### Reference Point Privacy

Reference points may contain sensitive information:
- "Payment webhook secret rotation"
- "Admin backdoor security fix"

**Mitigation:**
- Reference points stored only in local database (same as Frames)
- No telemetry or remote logging by default
- User controls when reference points are created

### Atlas Frame Exposure

Atlas Frames reveal architectural structure. Treat them as sensitive:
- Don't include in telemetry
- Don't upload to external services without encryption
- Warn users if sharing Frames publicly

## Migration and Backward Compatibility

### Adding Mind Palace to Existing LexBrain

1. **Schema migration:**
   ```sql
   -- Add columns to frames table
   ALTER TABLE frames ADD COLUMN reference_point TEXT;
   ALTER TABLE frames ADD COLUMN atlas_frame_id TEXT;
   
   -- Create new tables
   CREATE TABLE atlas_frames (...);
   CREATE TABLE reference_points (...);
   ```

2. **Backfill reference points (optional):**
   ```typescript
   // Generate reference points from existing summaries
   for (const frame of oldFrames) {
     const suggestedRef = extractFromSummary(frame.summary_caption);
     if (suggestedRef) {
       frame.reference_point = suggestedRef;
     }
   }
   ```

3. **Graceful fallback:**
   - Old Frames without `reference_point`: still searchable by keywords
   - Old Frames without `atlas_frame_id`: recall works, just no Atlas Frame

### Version Compatibility

```typescript
// LexBrain version check
const MIND_PALACE_MIN_VERSION = "0.5.0";

if (compareVersions(currentVersion, MIND_PALACE_MIN_VERSION) < 0) {
  console.warn(
    "Mind Palace requires LexBrain >= 0.5.0. " +
    "Reference points and Atlas Frames will not be available."
  );
}
```

## See Also

- [Mind Palace User Guide](./MIND_PALACE.md) - How to use reference points and recall
- [LexMap Integration](./ARCHITECTURE_LOOP.md) - Policy-aware reasoning
- [Frame Schema](./schemas/README.md) - Complete metadata specification
- [Contributing](../CONTRIBUTING.md) - Extending LexBrain safely