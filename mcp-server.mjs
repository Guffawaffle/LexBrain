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
import { readFileSync } from "fs";

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

  lexmap_get_atlas_frame: {
    description: "Get structural neighborhood data for modules from LexMap policy",
    inputSchema: {
      type: "object",
      required: ["module_scope"],
      properties: {
        module_scope: {
          type: "array",
          items: { type: "string" },
          description: "Seed module IDs (must match IDs in lexmap.policy.json)",
        },
        fold_radius: {
          type: "number",
          default: 1,
          description: "How many hops to expand from seed modules (default: 1)",
        },
      },
    },
    call: async (args) => {
      // Load lexmap.policy.json
      // Note: Future optimization could cache the parsed policy and use file watching
      // for updates, but keeping it simple for now to match existing tool patterns
      const policyPath = resolve(__dirname, "lexmap.policy.json");
      let policy;
      try {
        const policyContent = readFileSync(policyPath, "utf-8");
        policy = JSON.parse(policyContent);
      } catch (error) {
        throw new Error(`Failed to load lexmap.policy.json: ${error.message}`);
      }

      const modules = policy.modules || {};
      const moduleScope = args.module_scope || [];
      const foldRadius = args.fold_radius || 1;

      // Validate seed modules exist in policy
      for (const moduleId of moduleScope) {
        if (!modules[moduleId]) {
          throw new Error(
            `Module "${moduleId}" not found in lexmap.policy.json. Available modules: ${Object.keys(
              modules
            ).join(", ")}`
          );
        }
      }

      // Extract neighborhood using fold-radius expansion
      const neighborhood = new Set(moduleScope);
      const visited = new Set();

      // Build reverse lookup map: module -> modules that can call it (for O(1) lookup)
      const callees = new Map();
      for (const [moduleId, module] of Object.entries(modules)) {
        if (module.allowed_callers) {
          for (const caller of module.allowed_callers) {
            if (!callees.has(caller)) {
              callees.set(caller, []);
            }
            callees.get(caller).push(moduleId);
          }
        }
      }

      // Expand neighborhood by fold_radius hops
      for (let hop = 0; hop < foldRadius; hop++) {
        const currentLayer = [...neighborhood].filter((id) => !visited.has(id));

        for (const moduleId of currentLayer) {
          visited.add(moduleId);
          const module = modules[moduleId];

          // Add allowed callers (modules that can call this one)
          if (module.allowed_callers) {
            for (const caller of module.allowed_callers) {
              if (modules[caller]) {
                neighborhood.add(caller);
              }
            }
          }

          // Add modules this one is allowed to call (using reverse lookup map)
          if (callees.has(moduleId)) {
            for (const callee of callees.get(moduleId)) {
              neighborhood.add(callee);
            }
          }

          // Include forbidden_callers for structural awareness
          // These represent anti-patterns/violations and are important for
          // understanding architectural constraints (e.g., "UI should NOT call auth-core directly")
          if (module.forbidden_callers) {
            for (const forbiddenCaller of module.forbidden_callers) {
              if (modules[forbiddenCaller]) {
                neighborhood.add(forbiddenCaller);
              }
            }
          }
        }
      }

      // Build modules array with data from policy
      const modulesList = [...neighborhood].map((moduleId) => {
        const module = modules[moduleId];
        return {
          id: moduleId,
          coords: module.coords || [0, 0],
          allowed_callers: module.allowed_callers || [],
          forbidden_callers: module.forbidden_callers || [],
          feature_flags: module.feature_flags || [],
          requires_permissions: module.requires_permissions || [],
          kill_patterns: module.kill_patterns || [],
        };
      });

      // Generate Atlas Frame data blob
      const atlasFrame = {
        atlas_timestamp: new Date().toISOString(),
        seed_modules: moduleScope,
        fold_radius: foldRadius,
        modules: modulesList,
        critical_rule:
          "Every module name MUST match the IDs in lexmap.policy.json. No ad hoc naming.",
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(atlasFrame, null, 2),
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
