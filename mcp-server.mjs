#!/usr/bin/env node
/**
 * LexBrain MCP Server
 *
 * A Model Context Protocol (MCP) server for deterministic knowledge storage.
 * Speaks MCP over stdio, just like @modelcontextprotocol/server-memory.
 *
 * Usage:
 *   lexbrain-mcp
 *   npx -y /srv/lex-mcp/lex-brain
 *
 * Environment variables:
 *   LEXBRAIN_DB          - Path to SQLite database (default: ./thoughts.db)
 *   LEXBRAIN_MODE        - 'local' or 'zk' (default: local)
 *   LEXBRAIN_KEY_HEX     - 64-char hex key for ZK mode
 *   LEXBRAIN_TTL_DAYS    - Default TTL in days (default: 7)
 *   LEXBRAIN_MAX_PAYLOAD_KB - Max payload size in KB (default: 256)
 */

import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import Database from "better-sqlite3";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Configuration from environment
const config = {
  dbPath: process.env.LEXBRAIN_DB || resolve(__dirname, "thoughts.db"),
  mode: process.env.LEXBRAIN_MODE || "local",
  keyHex: process.env.LEXBRAIN_KEY_HEX,
  ttlDays: parseInt(process.env.LEXBRAIN_TTL_DAYS || "7"),
  maxPayloadKb: parseInt(process.env.LEXBRAIN_MAX_PAYLOAD_KB || "256"),
};

console.error(`[LexBrain] Starting MCP server`);
console.error(`[LexBrain] Database: ${config.dbPath}`);
console.error(`[LexBrain] Mode: ${config.mode}`);

// Validate ZK mode configuration
if (config.mode === "zk" && !config.keyHex) {
  console.error("[LexBrain] ERROR: LEXBRAIN_KEY_HEX is required in ZK mode");
  process.exit(1);
}

if (config.keyHex && config.keyHex.length !== 64) {
  console.error(
    "[LexBrain] ERROR: LEXBRAIN_KEY_HEX must be exactly 64 hex characters (32 bytes)"
  );
  process.exit(1);
}

// Initialize database
const db = new Database(config.dbPath);
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 5000");
db.pragma("synchronous = NORMAL");

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS facts (
    fact_id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    repo TEXT NOT NULL,
    "commit" TEXT NOT NULL,
    path TEXT,
    symbol TEXT,
    inputs_hash TEXT NOT NULL,
    payload TEXT NOT NULL,
    ts TEXT NOT NULL,
    ttl_seconds INTEGER,
    actor TEXT,
    refs TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_facts_rc ON facts(repo, "commit", kind);
  CREATE INDEX IF NOT EXISTS idx_facts_path ON facts(repo, "commit", path);
  
  CREATE TABLE IF NOT EXISTS frames (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    branch TEXT NOT NULL,
    jira TEXT,
    module_scope TEXT NOT NULL,
    summary_caption TEXT NOT NULL,
    reference_point TEXT NOT NULL,
    status_snapshot TEXT NOT NULL,
    keywords TEXT,
    atlas_frame_id TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_frames_timestamp ON frames(timestamp);
  CREATE INDEX IF NOT EXISTS idx_frames_branch ON frames(branch);
  CREATE INDEX IF NOT EXISTS idx_frames_jira ON frames(jira);
  
  CREATE VIRTUAL TABLE IF NOT EXISTS frames_fts USING fts5(
    id UNINDEXED,
    reference_point,
    summary_caption,
    keywords,
    content=frames,
    content_rowid=rowid
  );
  
  CREATE TRIGGER IF NOT EXISTS frames_ai AFTER INSERT ON frames BEGIN
    INSERT INTO frames_fts(rowid, id, reference_point, summary_caption, keywords)
    VALUES (new.rowid, new.id, new.reference_point, new.summary_caption, new.keywords);
  END;
  
  CREATE TRIGGER IF NOT EXISTS frames_ad AFTER DELETE ON frames BEGIN
    INSERT INTO frames_fts(frames_fts, rowid, id, reference_point, summary_caption, keywords)
    VALUES('delete', old.rowid, old.id, old.reference_point, old.summary_caption, old.keywords);
  END;
  
  CREATE TRIGGER IF NOT EXISTS frames_au AFTER UPDATE ON frames BEGIN
    INSERT INTO frames_fts(frames_fts, rowid, id, reference_point, summary_caption, keywords)
    VALUES('delete', old.rowid, old.id, old.reference_point, old.summary_caption, old.keywords);
    INSERT INTO frames_fts(rowid, id, reference_point, summary_caption, keywords)
    VALUES (new.rowid, new.id, new.reference_point, new.summary_caption, new.keywords);
  END;
  
  CREATE TABLE IF NOT EXISTS atlas_frames (
    atlas_frame_id TEXT PRIMARY KEY,
    frame_id TEXT NOT NULL,
    atlas_timestamp TEXT NOT NULL,
    reference_module TEXT NOT NULL,
    fold_radius INTEGER NOT NULL,
    atlas_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_atlas_frames_frame_id ON atlas_frames(frame_id);
  CREATE INDEX IF NOT EXISTS idx_atlas_frames_timestamp ON atlas_frames(atlas_timestamp);
  
  CREATE TABLE IF NOT EXISTS locks (
    name TEXT PRIMARY KEY
  );
`);

// Crypto utilities
function sha256(obj) {
  const jsonStr =
    typeof obj === "string"
      ? obj
      : JSON.stringify(obj, Object.keys(obj || {}).sort());
  return crypto.createHash("sha256").update(jsonStr, "utf8").digest("hex");
}

function factId(kind, scope, inputs_hash, payloadHash) {
  const composite = `${kind}:${scope.repo}:${scope.commit}:${
    scope.path || ""
  }:${scope.symbol || ""}:${inputs_hash}:${payloadHash}`;
  return sha256(composite);
}

function validatePayloadSize(payload) {
  const payloadStr =
    typeof payload === "string" ? payload : JSON.stringify(payload);
  const sizeKb = Buffer.byteLength(payloadStr, "utf8") / 1024;
  return sizeKb <= config.maxPayloadKb;
}

// MCP Tool implementations
const tools = {
  thought_put: {
    description: "Store a fact in the knowledge base",
    inputSchema: {
      type: "object",
      required: ["kind", "scope", "inputs_hash", "payload"],
      properties: {
        kind: {
          type: "string",
          enum: [
            "repo_scan",
            "dep_graph",
            "dep_score",
            "plan",
            "merge_order",
            "gate_result",
            "artifact",
            "note",
          ],
        },
        scope: {
          type: "object",
          required: ["repo", "commit"],
          properties: {
            repo: { type: "string" },
            commit: { type: "string" },
            path: { type: "string" },
            symbol: { type: "string" },
          },
        },
        inputs_hash: { type: "string" },
        payload: {},
        confidence: { type: "number" },
        ttl_seconds: { type: "integer", minimum: 60 },
        actor: {},
        refs: { type: "array", items: { type: "string" } },
      },
    },
    call: async (args) => {
      // Validate payload size
      if (!validatePayloadSize(args.payload)) {
        throw new Error(
          `Payload exceeds maximum size of ${config.maxPayloadKb}KB`
        );
      }

      // Validate TTL bounds
      const maxTtl = config.ttlDays * 24 * 3600;
      if (
        args.ttl_seconds &&
        (args.ttl_seconds < 60 || args.ttl_seconds > maxTtl)
      ) {
        throw new Error(`TTL must be between 60 seconds and ${maxTtl} seconds`);
      }

      // Prepare payload for storage
      let payloadForStorage;
      let payloadHash;

      if (config.mode === "zk") {
        if (
          typeof args.payload !== "object" ||
          !args.payload.ciphertext ||
          !args.payload.iv
        ) {
          throw new Error("ZK mode expects payload to be {ciphertext, iv}");
        }
        payloadForStorage = JSON.stringify(args.payload);
        payloadHash = sha256(args.payload.ciphertext);
      } else {
        payloadForStorage = JSON.stringify(args.payload);
        payloadHash = sha256(args.payload);
      }

      const fact_id = factId(
        args.kind,
        args.scope,
        args.inputs_hash,
        payloadHash
      );
      const ts = new Date().toISOString();

      const stmt = db.prepare(`
        INSERT OR IGNORE INTO facts (
          fact_id, kind, repo, "commit", path, symbol, inputs_hash,
          payload, ts, ttl_seconds, actor, refs
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        fact_id,
        args.kind,
        args.scope.repo,
        args.scope.commit,
        args.scope.path || null,
        args.scope.symbol || null,
        args.inputs_hash,
        payloadForStorage,
        ts,
        args.ttl_seconds || null,
        args.actor ? JSON.stringify(args.actor) : null,
        args.refs ? JSON.stringify(args.refs) : null
      );

      return {
        content: [
          {
            type: "text",
            text: `Fact stored: ${fact_id}\nInserted: ${result.changes > 0}`,
          },
        ],
      };
    },
  },

  thought_get: {
    description: "Query facts from the knowledge base",
    inputSchema: {
      type: "object",
      required: ["repo", "commit", "kind"],
      properties: {
        repo: { type: "string" },
        commit: { type: "string" },
        kind: {
          type: "string",
          enum: [
            "repo_scan",
            "dep_graph",
            "dep_score",
            "plan",
            "merge_order",
            "gate_result",
            "artifact",
            "note",
          ],
        },
        path: { type: "string" },
        symbol: { type: "string" },
        inputs_hash: { type: "string" },
      },
    },
    call: async (args) => {
      let sql =
        'SELECT * FROM facts WHERE repo = ? AND "commit" = ? AND kind = ?';
      const params = [args.repo, args.commit, args.kind];

      if (args.path !== undefined) {
        sql += " AND path = ?";
        params.push(args.path);
      }
      if (args.symbol !== undefined) {
        sql += " AND symbol = ?";
        params.push(args.symbol);
      }
      if (args.inputs_hash !== undefined) {
        sql += " AND inputs_hash = ?";
        params.push(args.inputs_hash);
      }

      const stmt = db.prepare(sql);
      const rows = stmt.all(...params);

      const facts = rows.map((row) => ({
        fact_id: row.fact_id,
        kind: row.kind,
        scope: {
          repo: row.repo,
          commit: row.commit,
          path: row.path || undefined,
          symbol: row.symbol || undefined,
        },
        inputs_hash: row.inputs_hash,
        payload: JSON.parse(row.payload),
        ts: row.ts,
        ttl_seconds: row.ttl_seconds || undefined,
        actor: row.actor ? JSON.parse(row.actor) : undefined,
        refs: row.refs ? JSON.parse(row.refs) : undefined,
      }));

      return {
        content: [
          {
            type: "text",
            text: `Found ${facts.length} fact(s):\n${JSON.stringify(
              facts,
              null,
              2
            )}`,
          },
        ],
      };
    },
  },

  thought_lock: {
    description: "Acquire an advisory lock",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string" },
      },
    },
    call: async (args) => {
      const stmt = db.prepare("INSERT OR IGNORE INTO locks (name) VALUES (?)");
      const result = stmt.run(args.name);
      const ok = result.changes > 0;

      return {
        content: [
          {
            type: "text",
            text: `Lock "${args.name}": ${
              ok ? "ACQUIRED" : "FAILED (already held)"
            }`,
          },
        ],
      };
    },
  },

  thought_unlock: {
    description: "Release an advisory lock",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string" },
      },
    },
    call: async (args) => {
      const stmt = db.prepare("DELETE FROM locks WHERE name = ?");
      const result = stmt.run(args.name);
      const ok = result.changes > 0;

      return {
        content: [
          {
            type: "text",
            text: `Lock "${args.name}": ${ok ? "RELEASED" : "NOT FOUND"}`,
          },
        ],
      };
    },
  },

  thought_recall: {
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
      },
    },
    call: async (args) => {
      // Validate that at least one query parameter is provided
      if (!args.reference_point && !args.jira && !args.frame_id) {
        throw new Error("At least one of reference_point, jira, or frame_id must be provided");
      }

      let frame = null;
      let sql, params;

      // Priority: frame_id > reference_point > jira
      if (args.frame_id) {
        sql = "SELECT * FROM frames WHERE id = ?";
        params = [args.frame_id];
        const row = db.prepare(sql).get(...params);
        if (row) {
          frame = {
            id: row.id,
            timestamp: row.timestamp,
            branch: row.branch,
            jira: row.jira || undefined,
            module_scope: JSON.parse(row.module_scope),
            summary_caption: row.summary_caption,
            reference_point: row.reference_point,
            status_snapshot: JSON.parse(row.status_snapshot),
            keywords: row.keywords ? JSON.parse(row.keywords) : undefined,
            atlas_frame_id: row.atlas_frame_id || undefined
          };
        }
      } else if (args.reference_point) {
        // Use FTS fuzzy search on reference_point
        sql = `
          SELECT frames.* FROM frames
          INNER JOIN frames_fts ON frames.rowid = frames_fts.rowid
          WHERE frames_fts MATCH ?
          ORDER BY frames.timestamp DESC
          LIMIT 1
        `;
        params = [args.reference_point];
        const row = db.prepare(sql).get(...params);
        if (row) {
          frame = {
            id: row.id,
            timestamp: row.timestamp,
            branch: row.branch,
            jira: row.jira || undefined,
            module_scope: JSON.parse(row.module_scope),
            summary_caption: row.summary_caption,
            reference_point: row.reference_point,
            status_snapshot: JSON.parse(row.status_snapshot),
            keywords: row.keywords ? JSON.parse(row.keywords) : undefined,
            atlas_frame_id: row.atlas_frame_id || undefined
          };
        }
      } else if (args.jira) {
        // Search by JIRA ticket
        sql = "SELECT * FROM frames WHERE jira = ? ORDER BY timestamp DESC LIMIT 1";
        params = [args.jira];
        const row = db.prepare(sql).get(...params);
        if (row) {
          frame = {
            id: row.id,
            timestamp: row.timestamp,
            branch: row.branch,
            jira: row.jira || undefined,
            module_scope: JSON.parse(row.module_scope),
            summary_caption: row.summary_caption,
            reference_point: row.reference_point,
            status_snapshot: JSON.parse(row.status_snapshot),
            keywords: row.keywords ? JSON.parse(row.keywords) : undefined,
            atlas_frame_id: row.atlas_frame_id || undefined
          };
        }
      }

      if (!frame) {
        throw new Error("No matching Frame found");
      }

      // Fetch linked Atlas Frame if exists
      let atlasFrame = null;
      if (frame.atlas_frame_id) {
        const atlasStmt = db.prepare("SELECT * FROM atlas_frames WHERE atlas_frame_id = ?");
        const atlasRow = atlasStmt.get(frame.atlas_frame_id);
        if (atlasRow) {
          atlasFrame = JSON.parse(atlasRow.atlas_json);
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              frame,
              atlas_frame: atlasFrame
            }, null, 2),
          },
        ],
      };
    },
  },
};

// MCP Protocol handler - JSON-RPC 2.0 over stdio
async function handleRequest(request) {
  const { id, method, params } = request;

  try {
    // MCP initialization handshake
    if (method === "initialize") {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: "lexbrain",
            version: "0.1.0",
          },
        },
      };
    }

    // After initialization, client sends initialized notification
    if (method === "notifications/initialized") {
      // No response needed for notifications
      return null;
    }

    // Tool listing
    if (method === "tools/list") {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          tools: Object.entries(tools).map(([name, spec]) => ({
            name,
            description: spec.description,
            inputSchema: spec.inputSchema,
          })),
        },
      };
    }

    // Tool execution
    if (method === "tools/call") {
      const { name, arguments: args } = params;
      const tool = tools[name];

      if (!tool) {
        return {
          jsonrpc: "2.0",
          id,
          error: {
            code: -32601,
            message: `Unknown tool: ${name}`,
          },
        };
      }

      try {
        const result = await tool.call(args);
        return {
          jsonrpc: "2.0",
          id,
          result,
        };
      } catch (error) {
        return {
          jsonrpc: "2.0",
          id,
          error: {
            code: -32603,
            message: error.message,
          },
        };
      }
    }

    // Unknown method
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32601,
        message: `Method not found: ${method}`,
      },
    };
  } catch (error) {
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32603,
        message: error.message,
      },
    };
  }
}

// Stdio message loop - line-delimited JSON
let buffer = "";

process.stdin.setEncoding("utf8");
process.stdin.on("data", async (chunk) => {
  buffer += chunk;
  const lines = buffer.split("\n");
  buffer = lines.pop(); // Keep incomplete line in buffer

  for (const line of lines) {
    if (!line.trim()) continue;

    try {
      const request = JSON.parse(line);
      const response = await handleRequest(request);

      // Only send response for requests (not notifications)
      if (response) {
        console.log(JSON.stringify(response));
      }
    } catch (error) {
      console.error(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32700,
            message: `Parse error: ${error.message}`,
          },
        })
      );
    }
  }
});

process.stdin.on("end", () => {
  db.close();
  process.exit(0);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.error("[LexBrain] Shutting down...");
  db.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.error("[LexBrain] Shutting down...");
  db.close();
  process.exit(0);
});

process.on("uncaughtException", (error) => {
  console.error(`[LexBrain] Uncaught exception: ${error.message}`);
  db.close();
  process.exit(1);
});
