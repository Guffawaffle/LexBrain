import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import {
  register,
  collectDefaultMetrics,
  Counter,
  Histogram,
} from "prom-client";
import { DbManager } from "./db.js";
import { sha256, factId } from "./crypto.js";
import {
  PutRequest,
  GetRequest,
  LockRequest,
  UnlockRequest,
  ThoughtFact,
} from "./types.js";

// Environment configuration
const config = {
  port: parseInt(process.env.PORT || "6901"),
  maxPayloadKb: parseInt(process.env.LEXBRAIN_MAX_PAYLOAD_KB || "256"),
  ttlDays: parseInt(process.env.LEXBRAIN_TTL_DAYS || "7"),
  mode: (process.env.LEXBRAIN_MODE || "local") as "local" | "zk",
  keyHex: process.env.LEXBRAIN_KEY_HEX,
  dbPath: process.env.LEXBRAIN_DB || "./thoughts.db",
};

// Validate ZK mode configuration
if (config.mode === "zk" && !config.keyHex) {
  console.error("LEXBRAIN_KEY_HEX is required in ZK mode");
  process.exit(1);
}

if (config.keyHex && config.keyHex.length !== 64) {
  console.error(
    "LEXBRAIN_KEY_HEX must be exactly 64 hex characters (32 bytes)"
  );
  process.exit(1);
}

// Initialize metrics
collectDefaultMetrics();

const requestCounter = new Counter({
  name: "lexbrain_requests_total",
  help: "Total number of requests",
  labelNames: ["method", "endpoint", "status"],
});

const requestDuration = new Histogram({
  name: "lexbrain_request_duration_seconds",
  help: "Request duration in seconds",
  labelNames: ["method", "endpoint"],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0],
});

const cacheHits = new Counter({
  name: "lexbrain_cache_hits_total",
  help: "Cache hits vs misses",
  labelNames: ["type"], // 'hit' or 'miss'
});

// Initialize database
const db = new DbManager(config.dbPath);

// Initialize Express app
const app = express();

// Middleware
app.use(helmet());
app.use(morgan("combined"));
app.use(express.json({ limit: "1mb" }));

// Metrics middleware
app.use((req, res, next) => {
  const start = Date.now();

  res.on("finish", () => {
    const duration = (Date.now() - start) / 1000;
    const endpoint = req.route?.path || req.path;

    requestCounter
      .labels(req.method, endpoint, res.statusCode.toString())
      .inc();
    requestDuration.labels(req.method, endpoint).observe(duration);
  });

  next();
});

// ---------------- MCP HTTP endpoints ----------------
// Minimal MCP-over-HTTP shim so different MCP clients (Claude, GPT, etc.)
// can discover and call tools against this same HTTP server.

// GET /mcp/tools/list - return available tools and input schemas
app.get("/mcp/tools/list", (req, res) => {
  const tools = [
    {
      name: "thought.put",
      description: "Append a fact",
      input_schema: {
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
              "frame",
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
    },
    {
      name: "thought.get",
      description: "Query facts",
      input_schema: {
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
              "frame",
            ],
          },
          path: { type: "string" },
          symbol: { type: "string" },
          inputs_hash: { type: "string" },
        },
      },
    },
    {
      name: "thought.lock",
      description: "Acquire lock",
      input_schema: {
        type: "object",
        required: ["name"],
        properties: { name: { type: "string" } },
      },
    },
    {
      name: "thought.unlock",
      description: "Release lock",
      input_schema: {
        type: "object",
        required: ["name"],
        properties: { name: { type: "string" } },
      },
    },
  ];

  res.json({ tools });
});

// POST /mcp/tools/call - execute a tool by name with arguments
app.post("/mcp/tools/call", async (req, res) => {
  const start = Date.now();
  const endpoint = "/mcp/tools/call";
  try {
    const { name, arguments: args } = req.body || {};
    if (!name) return res.status(400).json({ error: "Missing tool name" });

    switch (name) {
      case "thought.put": {
        const body = PutRequest.parse(args);

        // Validate payload size
        if (!validatePayloadSize(body.payload)) {
          return res.status(413).json({
            error: `Payload exceeds maximum size of ${config.maxPayloadKb}KB`,
          });
        }

        // Validate TTL bounds
        const maxTtl = config.ttlDays * 24 * 3600;
        if (
          body.ttl_seconds &&
          (body.ttl_seconds < 60 || body.ttl_seconds > maxTtl)
        ) {
          return res.status(400).json({
            error: `TTL must be between 60 seconds and ${maxTtl} seconds`,
          });
        }

        // Prepare payload for storage
        let payloadForStorage: string;
        let payloadHash: string;
        if (config.mode === "zk") {
          if (typeof body.payload !== "object" || body.payload === null) {
            return res.status(400).json({
              error: "ZK mode expects payload to be {ciphertext, iv}",
            });
          }
          const zkPayload = body.payload as { ciphertext: string; iv: string };
          if (!zkPayload.ciphertext || !zkPayload.iv) {
            return res
              .status(400)
              .json({ error: "ZK payload must have ciphertext and iv fields" });
          }
          payloadForStorage = JSON.stringify(zkPayload);
          payloadHash = sha256(zkPayload.ciphertext);
        } else {
          payloadForStorage = JSON.stringify(body.payload);
          payloadHash = sha256(body.payload);
        }

        const fact_id = factId(
          body.kind,
          body.scope,
          body.inputs_hash,
          payloadHash
        );
        const ts = new Date().toISOString();
        const inserted = db.insertFact({
          fact_id,
          kind: body.kind,
          scope: body.scope,
          inputs_hash: body.inputs_hash,
          payload_json: payloadForStorage,
          confidence: body.confidence,
          ts,
          ttl_seconds: body.ttl_seconds,
          actor: body.actor,
          refs: body.refs,
        });
        return res.json({ fact_id, inserted });
      }

      case "thought.get": {
        const query = GetRequest.parse(args);
        const isExactQuery = query.inputs_hash !== undefined;
        const rows = db.getFacts({
          repo: query.repo,
          commit: query.commit,
          kind: query.kind,
          path: query.path,
          symbol: query.symbol,
          inputs_hash: query.inputs_hash,
        });
        if (isExactQuery)
          cacheHits.labels(rows.length > 0 ? "hit" : "miss").inc();
        const facts: ThoughtFact[] = rows.map((row) => ({
          fact_id: row.fact_id,
          kind: row.kind as any,
          scope: {
            repo: row.repo,
            commit: row.commit,
            path: row.path || undefined,
            symbol: row.symbol || undefined,
          },
          inputs_hash: row.inputs_hash,
          payload: JSON.parse(row.payload),
          confidence: undefined,
          ts: row.ts,
          ttl_seconds: row.ttl_seconds || undefined,
          actor: row.actor ? JSON.parse(row.actor) : undefined,
          refs: row.refs ? JSON.parse(row.refs) : undefined,
        }));
        return res.json({ content: facts });
      }

      case "thought.lock": {
        const body = LockRequest.parse(args);
        const ok = db.acquireLock(body.name);
        return res.json({ ok });
      }

      case "thought.unlock": {
        const body = UnlockRequest.parse(args);
        const ok = db.releaseLock(body.name);
        return res.json({ ok });
      }

      default:
        return res.status(400).json({ error: `Unknown tool: ${name}` });
    }
  } catch (error) {
    console.error("MCP call error:", error);
    if (error instanceof Error && (error as any).name === "ZodError") {
      return res.status(400).json({ error: "Invalid request format" });
    }
    res.status(500).json({ error: "Internal server error" });
  } finally {
    const duration = (Date.now() - start) / 1000;
    requestCounter
      .labels("POST", endpoint, res.statusCode?.toString?.() || "200")
      .inc();
    requestDuration.labels("POST", endpoint).observe(duration);
  }
});

// Helper function to validate payload size
function validatePayloadSize(payload: unknown): boolean {
  const payloadStr =
    typeof payload === "string" ? payload : JSON.stringify(payload);
  const sizeKb = Buffer.byteLength(payloadStr, "utf8") / 1024;
  return sizeKb <= config.maxPayloadKb;
}

// POST /put - Store a fact
app.post("/put", async (req, res) => {
  try {
    const body = PutRequest.parse(req.body);

    // Validate payload size
    if (!validatePayloadSize(body.payload)) {
      return res.status(413).json({
        error: `Payload exceeds maximum size of ${config.maxPayloadKb}KB`,
      });
    }

    // Validate TTL bounds
    const maxTtl = config.ttlDays * 24 * 3600;
    if (
      body.ttl_seconds &&
      (body.ttl_seconds < 60 || body.ttl_seconds > maxTtl)
    ) {
      return res.status(400).json({
        error: `TTL must be between 60 seconds and ${maxTtl} seconds`,
      });
    }

    // Prepare payload for storage
    let payloadForStorage: string;
    let payloadHash: string;

    if (config.mode === "zk") {
      // In ZK mode, expect payload to be {ciphertext, iv}
      if (typeof body.payload !== "object" || body.payload === null) {
        return res
          .status(400)
          .json({ error: "ZK mode expects payload to be {ciphertext, iv}" });
      }

      const zkPayload = body.payload as { ciphertext: string; iv: string };
      if (!zkPayload.ciphertext || !zkPayload.iv) {
        return res
          .status(400)
          .json({ error: "ZK payload must have ciphertext and iv fields" });
      }

      payloadForStorage = JSON.stringify(zkPayload);
      payloadHash = sha256(zkPayload.ciphertext);
    } else {
      // Local mode - store plaintext
      payloadForStorage = JSON.stringify(body.payload);
      payloadHash = sha256(body.payload);
    }

    // Generate fact ID
    const fact_id = factId(
      body.kind,
      body.scope,
      body.inputs_hash,
      payloadHash
    );

    // Create timestamp
    const ts = new Date().toISOString();

    // Insert into database
    const inserted = db.insertFact({
      fact_id,
      kind: body.kind,
      scope: body.scope,
      inputs_hash: body.inputs_hash,
      payload_json: payloadForStorage,
      confidence: body.confidence,
      ts,
      ttl_seconds: body.ttl_seconds,
      actor: body.actor,
      refs: body.refs,
    });

    res.json({ fact_id, inserted });
  } catch (error) {
    console.error("PUT error:", error);
    if (error instanceof Error && error.name === "ZodError") {
      return res.status(400).json({ error: "Invalid request format" });
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /get - Query facts
app.post("/get", async (req, res) => {
  try {
    const query = GetRequest.parse(req.body);

    // Check for exact hit (when inputs_hash is provided)
    const isExactQuery = query.inputs_hash !== undefined;

    const rows = db.getFacts({
      repo: query.repo,
      commit: query.commit,
      kind: query.kind,
      path: query.path,
      symbol: query.symbol,
      inputs_hash: query.inputs_hash,
    });

    // Record cache metrics
    if (isExactQuery) {
      cacheHits.labels(rows.length > 0 ? "hit" : "miss").inc();
    }

    // Transform database rows to ThoughtFacts
    const facts: ThoughtFact[] = rows.map((row) => ({
      fact_id: row.fact_id,
      kind: row.kind as any,
      scope: {
        repo: row.repo,
        commit: row.commit,
        path: row.path || undefined,
        symbol: row.symbol || undefined,
      },
      inputs_hash: row.inputs_hash,
      payload: JSON.parse(row.payload), // Return as-is (plaintext in local, {ciphertext,iv} in zk)
      confidence: undefined, // Not stored in current schema
      ts: row.ts,
      ttl_seconds: row.ttl_seconds || undefined,
      actor: row.actor ? JSON.parse(row.actor) : undefined,
      refs: row.refs ? JSON.parse(row.refs) : undefined,
    }));

    res.json(facts);
  } catch (error) {
    console.error("GET error:", error);
    if (error instanceof Error && error.name === "ZodError") {
      return res.status(400).json({ error: "Invalid request format" });
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /lock - Acquire advisory lock
app.post("/lock", async (req, res) => {
  try {
    const body = LockRequest.parse(req.body);
    const acquired = db.acquireLock(body.name);
    res.json({ ok: acquired });
  } catch (error) {
    console.error("LOCK error:", error);
    if (error instanceof Error && error.name === "ZodError") {
      return res.status(400).json({ error: "Invalid request format" });
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /unlock - Release advisory lock
app.post("/unlock", async (req, res) => {
  try {
    const body = UnlockRequest.parse(req.body);
    const released = db.releaseLock(body.name);
    res.json({ ok: released });
  } catch (error) {
    console.error("UNLOCK error:", error);
    if (error instanceof Error && error.name === "ZodError") {
      return res.status(400).json({ error: "Invalid request format" });
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /metrics - Prometheus metrics
app.get("/metrics", async (req, res) => {
  try {
    const metrics = await register.metrics();
    res.set("Content-Type", register.contentType);
    res.send(metrics);
  } catch (error) {
    console.error("Metrics error:", error);
    res.status(500).json({ error: "Failed to generate metrics" });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  const stats = db.getStats();
  res.json({
    status: "ok",
    mode: config.mode,
    stats,
  });
});

// TTL garbage collection
function runGarbageCollection() {
  try {
    const deleted = db.cleanupExpiredFacts();
    if (deleted > 0) {
      console.log(`GC: Cleaned up ${deleted} expired facts`);
    }
  } catch (error) {
    console.error("GC error:", error);
  }
}

// Run GC at startup and every 10 minutes
runGarbageCollection();
const gcInterval = setInterval(runGarbageCollection, 10 * 60 * 1000);

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("Shutting down gracefully...");
  clearInterval(gcInterval);
  db.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("Shutting down gracefully...");
  clearInterval(gcInterval);
  db.close();
  process.exit(0);
});

// Start server
app.listen(config.port, () => {
  console.log(`LexBrain server starting on port ${config.port}`);
  console.log(`Mode: ${config.mode}`);
  console.log(`Database: ${config.dbPath}`);
  console.log(`Max payload: ${config.maxPayloadKb}KB`);
  console.log(`TTL limit: ${config.ttlDays} days`);
  if (config.mode === "zk") {
    console.log("ZK mode: Client-side encryption enabled");
  }
});

// Export for testing if needed
// export default app;
