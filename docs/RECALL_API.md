# Recall API Usage

## Overview

The Recall API enables retrieval of work context using human-memorable reference points, returning both Frame metadata and associated Atlas Frame.

## Endpoints

### HTTP API

#### POST /recall

Recall work context by reference point, JIRA ticket, or frame ID.

**Request Body:**
```json
{
  "reference_point": "Add User button",  // Optional: fuzzy matched phrase
  "jira": "TICKET-123",                   // Optional: exact JIRA ticket ID
  "frame_id": "frame_abc123"              // Optional: exact frame ID
}
```

**Note:** At least one parameter must be provided. Priority: `frame_id` > `reference_point` > `jira`

**Response (200 OK):**
```json
{
  "frame": {
    "id": "frame_abc123",
    "timestamp": "2025-11-01T22:30:00Z",
    "branch": "feature/TICKET-123",
    "jira": "TICKET-123",
    "module_scope": ["ui/user-admin-panel"],
    "summary_caption": "Working on Add User button",
    "reference_point": "Add User button still disabled",
    "status_snapshot": {
      "next_action": "Reroute user-admin-panel to call user-access-api instead of auth-core",
      "blockers": ["Direct call to auth-core forbidden by policy"]
    },
    "keywords": ["user", "admin", "button", "disabled"],
    "atlas_frame_id": "atlas_xyz789"
  },
  "atlas_frame": {
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
      }
    ],
    "edges": [
      {
        "from": "ui/user-admin-panel",
        "to": "services/user-access-api",
        "allowed": true,
        "rule": "ui-must-use-service-layer"
      }
    ],
    "critical_rule": "THE CRITICAL RULE: module_scope must use canonical module IDs from LexMap"
  }
}
```

**Response (404 Not Found):**
```json
{
  "error": "No matching Frame found"
}
```

**Response (400 Bad Request):**
```json
{
  "error": "At least one of reference_point, jira, or frame_id must be provided"
}
```

### MCP Tool

#### thought.recall

Recall work context via MCP protocol.

**Tool Definition:**
```json
{
  "name": "thought.recall",
  "description": "Recall work context by reference point, returning Frame + Atlas Frame",
  "inputSchema": {
    "type": "object",
    "properties": {
      "reference_point": {
        "type": "string",
        "description": "Human-memorable anchor phrase (fuzzy matched)"
      },
      "jira": {
        "type": "string",
        "description": "Alternative: recall by ticket ID"
      },
      "frame_id": {
        "type": "string",
        "description": "Alternative: recall specific Frame by ID"
      }
    }
  }
}
```

**MCP Call:**
```json
{
  "name": "thought.recall",
  "arguments": {
    "reference_point": "Add User button"
  }
}
```

**MCP Response:**
```json
{
  "content": {
    "frame": { ... },
    "atlas_frame": { ... }
  }
}
```

## Usage Examples

### Example 1: Recall by Reference Point (Fuzzy)

**User Query:** "Where did I leave off with the Add User button?"

**Request:**
```bash
curl -X POST http://localhost:6901/recall \
  -H "Content-Type: application/json" \
  -d '{"reference_point":"Add User button"}'
```

**What Happens:**
1. System performs FTS (Full-Text Search) on `reference_point` field
2. Fuzzy matches "Add User button" against stored reference points
3. Returns most recent matching Frame
4. Includes linked Atlas Frame if exists

**Response:** Frame + Atlas Frame showing module neighborhood

### Example 2: Recall by JIRA Ticket

**User Query:** "What was the status of TICKET-123?"

**Request:**
```bash
curl -X POST http://localhost:6901/recall \
  -H "Content-Type: application/json" \
  -d '{"jira":"TICKET-123"}'
```

**What Happens:**
1. Exact match on `jira` field
2. Returns most recent Frame for that ticket
3. Includes linked Atlas Frame if exists

### Example 3: Recall Specific Frame

**Request:**
```bash
curl -X POST http://localhost:6901/recall \
  -H "Content-Type: application/json" \
  -d '{"frame_id":"frame_abc123"}'
```

**What Happens:**
1. Direct lookup by Frame ID
2. Returns exact Frame
3. Includes linked Atlas Frame if exists

## Fuzzy Matching

The reference point search uses SQLite FTS5 for fuzzy matching:

**Query:** "auth timeout"  
**Matches:** "Auth handshake timeout"

**Query:** "Add User"  
**Matches:** "Add User button still disabled"

**How it works:**
- Full-text search across reference_point, summary_caption, and keywords
- Case-insensitive
- Tokenizes on word boundaries
- Returns most recent match when multiple frames match

## Priority Order

When multiple parameters are provided, the priority is:
1. **frame_id** - Exact frame lookup (highest priority)
2. **reference_point** - Fuzzy search
3. **jira** - Exact ticket lookup (lowest priority)

## Graceful Fallback

- If no Atlas Frame is linked to the Frame, `atlas_frame` is `null`
- System always returns Frame even if Atlas Frame doesn't exist
- Enables gradual adoption (Atlas Frames are optional)

## Testing

### Insert Test Data

```bash
cd packages/server
sqlite3 thoughts.db << 'EOF'
INSERT INTO frames (
  id, timestamp, branch, jira, module_scope, summary_caption,
  reference_point, status_snapshot, keywords, atlas_frame_id
) VALUES (
  'frame_test_123',
  '2025-11-02T12:00:00Z',
  'feature/test',
  'TEST-123',
  '["my/module"]',
  'Test frame',
  'Test reference point',
  '{"next_action":"Test action","blockers":[]}',
  '["test"]',
  NULL
);
EOF
```

### Test Recall

```bash
# By reference point
curl -X POST http://localhost:6901/recall \
  -H "Content-Type: application/json" \
  -d '{"reference_point":"Test reference"}' | jq .

# By JIRA
curl -X POST http://localhost:6901/recall \
  -H "Content-Type: application/json" \
  -d '{"jira":"TEST-123"}' | jq .

# By frame_id
curl -X POST http://localhost:6901/recall \
  -H "Content-Type: application/json" \
  -d '{"frame_id":"frame_test_123"}' | jq .
```

## Integration with Mind Palace

The Recall API is a core component of the Mind Palace system:

1. **Reference Points** - Human-memorable anchor phrases
2. **Atlas Frames** - Structural context (module neighborhoods)
3. **Fuzzy Search** - Natural language queries
4. **Efficient Recall** - Sub-second retrieval vs full history replay

See [Mind Palace Architecture](./MIND_PALACE_ARCHITECTURE.md) for more details.

## See Also

- [Mind Palace Guide](./MIND_PALACE.md)
- [Schema Documentation](./schemas/README.md)
- [Architecture Overview](./ARCHITECTURE_LOOP.md)
