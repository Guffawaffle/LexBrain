# LexBrain Schemas

This directory contains JSON schema definitions and documentation for LexBrain's data structures.

## Schema Files

- [`atlas-frame.schema.json`](./atlas-frame.schema.json) - Atlas Frame structure for Mind Palace
- [`frame.schema.json`](./frame.schema.json) - Frame metadata structure (to be added)

## Core Schemas

### Frame Metadata

A **Frame** captures a deliberate snapshot of a meaningful engineering moment.

**Schema location:** `frame.schema.json` (to be created)

**Key fields:**

```json
{
  "timestamp": "2025-11-01T22:30:00Z",
  "branch": "feature/TICKET-123_auth_fix",
  "jira": ["TICKET-123"],
  "reference_point": "Add User button still disabled",
  "module_scope": ["ui/user-admin-panel"],
  "atlas_frame_id": "atlas_xyz789",
  "feature_flags": ["beta_user_admin"],
  "permissions": ["can_manage_users"],
  "summary_caption": "Auth handshake timeout; admin panel calling forbidden service",
  "status_snapshot": {
    "tests_failing": 2,
    "merge_blockers": [
      "UserAccessController wiring",
      "ExternalAuthClient timeout handling"
    ],
    "next_action": "Reroute through user-access-api instead of auth-core"
  },
  "keywords": [
    "Add User disabled",
    "auth timeout",
    "user-access-api",
    "forbidden-service"
  ]
}
```

#### Field Descriptions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `timestamp` | string (ISO 8601) | ✅ | When Frame was captured |
| `branch` | string | ✅ | Git branch name |
| `jira` | array of strings | ❌ | Ticket IDs (e.g. ["TICKET-123"]) |
| `reference_point` | string | ❌ | Human-memorable anchor phrase (Mind Palace) |
| `module_scope` | array of strings | ✅ | Canonical module IDs from LexMap |
| `atlas_frame_id` | string | ❌ | Link to associated Atlas Frame |
| `feature_flags` | array of strings | ❌ | Active feature flags during capture |
| `permissions` | array of strings | ❌ | Required permissions |
| `summary_caption` | string | ✅ | Human summary of what mattered |
| `status_snapshot` | object | ✅ | Current state and blockers |
| `status_snapshot.tests_failing` | number | ❌ | Count of failing tests |
| `status_snapshot.merge_blockers` | array of strings | ❌ | What's blocking merge |
| `status_snapshot.next_action` | string | ✅ | What to do next |
| `keywords` | array of strings | ❌ | Searchable keywords |

#### THE CRITICAL RULE

> **THE CRITICAL RULE:**
> Every module name in `module_scope` MUST match the module IDs defined in LexMap's `lexmap.policy.json`.
> No ad hoc naming. No "almost the same module."

This rule is the bridge between LexBrain (memory) and LexMap (policy).

### Atlas Frame

An **Atlas Frame** is a structural snapshot of the module neighborhood relevant to a Frame.

**Schema location:** [`atlas-frame.schema.json`](./atlas-frame.schema.json)

**Structure:**

```json
{
  "atlas_frame_id": "atlas_xyz789",
  "frame_id": "frame_abc123",
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
```

#### Field Descriptions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `atlas_frame_id` | string | ✅ | Unique identifier for this Atlas Frame |
| `frame_id` | string | ✅ | Parent Frame ID |
| `atlas_timestamp` | string (ISO 8601) | ✅ | When Atlas Frame was generated |
| `reference_module` | string | ✅ | Module at center of neighborhood |
| `fold_radius` | integer | ✅ | How many hops to expand (typically 1) |
| `modules` | array of objects | ✅ | Modules in neighborhood |
| `modules[].id` | string | ✅ | Canonical module ID from LexMap |
| `modules[].coordinates` | object | ✅ | Spatial position |
| `modules[].coordinates.x` | number | ✅ | X coordinate |
| `modules[].coordinates.y` | number | ✅ | Y coordinate |
| `modules[].layer` | string | ✅ | Architecture layer (presentation, application, domain, infrastructure) |
| `edges` | array of objects | ✅ | Directed edges between modules |
| `edges[].from` | string | ✅ | Source module ID |
| `edges[].to` | string | ✅ | Target module ID |
| `edges[].allowed` | boolean | ✅ | Policy verdict (true = allowed, false = forbidden) |
| `critical_rule` | string | ✅ | THE CRITICAL RULE text |

#### Fold Radius Logic

The fold radius determines how many graph hops to expand from the reference module:

- **Radius 0**: Just the reference module itself
- **Radius 1**: Reference module + direct neighbors (default)
- **Radius 2**: Reference module + neighbors + neighbors-of-neighbors

**Example with radius 1 from `ui/user-admin-panel`:**

```
Included:
- ui/user-admin-panel (reference, distance 0)
- services/user-access-api (direct neighbor, distance 1)
- services/auth-core (direct neighbor, distance 1)

NOT included:
- database/user-store (distance 2, via user-access-api)
- ui/dashboard (sibling module, not connected)
```

#### Policy Edge Interpretation

Edges in the Atlas Frame show allowed/forbidden relationships:

- `allowed: true` - Policy permits this edge (follow the path)
- `allowed: false` - Policy forbids this edge (explains why something is blocked)

**Why include forbidden edges?**

Forbidden edges are essential for explaining blockers:

> "The Add User button is disabled because `ui/user-admin-panel` was trying to call `services/auth-core`, which is forbidden. The allowed path is through `user-access-api`."

Without forbidden edges, the assistant can't explain **why** something doesn't work.

### Reference Point

A **reference point** is a lightweight index entry for fuzzy searching Frames.

**Storage:** Database table, not a separate file

**Structure:**

```json
{
  "reference_point_id": "ref_123",
  "frame_id": "frame_abc123",
  "reference_text": "Add User button still disabled",
  "normalized_text": "add user button still disabl",
  "created_at": "2025-11-01T22:30:00Z"
}
```

#### Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `reference_point_id` | string | Unique identifier |
| `frame_id` | string | Parent Frame ID |
| `reference_text` | string | Original human phrase |
| `normalized_text` | string | Lowercased, stemmed for fuzzy search |
| `created_at` | string (ISO 8601) | When reference point was created |

#### Normalization

Reference points are normalized for fuzzy matching:

1. Lowercase
2. Remove punctuation
3. Simple stemming (e.g. "disabled" → "disabl")

This enables queries like:
- "Add User button" matches "add user button still disabled"
- "auth timeout" matches "Auth handshake timeout issue"

## Validation

### Frame Validation

Frames must pass these validations:

1. **module_scope validation** - Every module ID must exist in LexMap
2. **timestamp validation** - Must be valid ISO 8601
3. **required fields** - `timestamp`, `branch`, `module_scope`, `summary_caption`, `status_snapshot.next_action`

### Atlas Frame Validation

Atlas Frames must pass these validations:

1. **module ID validation** - Every module in `modules` and `edges` must exist in LexMap
2. **coordinate validation** - All modules must have valid coordinates
3. **layer validation** - Layer must be one of: presentation, application, domain, infrastructure
4. **edge validation** - `from` and `to` must reference modules in the `modules` array

## Schema Evolution

### Backward Compatibility

Schema changes must be backward compatible:

- **Adding optional fields**: ✅ Safe
- **Adding required fields with defaults**: ✅ Safe
- **Renaming fields**: ❌ Breaking change, requires migration
- **Removing fields**: ❌ Breaking change, requires migration

### Migration Strategy

If a breaking change is necessary:

1. Version the schema (e.g. `frame-v2.schema.json`)
2. Support both old and new schemas during transition period
3. Provide migration tool: `lexbrain migrate-frames --from-version 1 --to-version 2`
4. Document the migration in release notes

## Extending Schemas

### Adding New Fields to Frames

If you want to add a new field:

1. **Propose it in an issue first** - explain what problem it solves
2. **Update the schema file** - add the field to `frame.schema.json`
3. **Update this README** - document the new field
4. **Update the code** - TypeScript types, database schema, validation
5. **Ensure backward compatibility** - make it optional or provide a default

Example good addition:

```json
{
  "environment": "staging"  // Which env the Frame was captured in
}
```

Example bad addition:

```json
{
  "engineer_heartbeat_bpm": 72  // This is surveillance; we don't do that
}
```

### Adding New Schemas

If you need a completely new data structure:

1. Create `<name>.schema.json` in this directory
2. Add documentation in this README
3. Add JSON schema validation
4. Update TypeScript types

## Example Usage

### Validating a Frame

```typescript
import Ajv from "ajv";
import frameSchema from "./frame.schema.json";

const ajv = new Ajv();
const validate = ajv.compile(frameSchema);

const frame = {
  timestamp: "2025-11-01T22:30:00Z",
  branch: "feature/TICKET-123",
  module_scope: ["ui/user-admin-panel"],
  summary_caption: "...",
  status_snapshot: {
    next_action: "..."
  }
};

if (!validate(frame)) {
  console.error("Invalid Frame:", validate.errors);
}
```

### Validating an Atlas Frame

```typescript
import atlasFrameSchema from "./atlas-frame.schema.json";

const validate = ajv.compile(atlasFrameSchema);

const atlasFrame = {
  atlas_frame_id: "atlas_xyz",
  frame_id: "frame_abc",
  atlas_timestamp: "2025-11-01T22:30:00Z",
  reference_module: "ui/user-admin-panel",
  fold_radius: 1,
  modules: [...],
  edges: [...],
  critical_rule: "..."
};

if (!validate(atlasFrame)) {
  console.error("Invalid Atlas Frame:", validate.errors);
}
```

## See Also

- [Mind Palace User Guide](../MIND_PALACE.md) - How to use reference points
- [Mind Palace Architecture](../MIND_PALACE_ARCHITECTURE.md) - Implementation details
- [Contributing](../../CONTRIBUTING.md) - Extending LexBrain safely
- [THE CRITICAL RULE](../../README.md#the-critical-rule) - Module scope requirements