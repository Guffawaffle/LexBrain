#!/usr/bin/env node
/**
 * LexBrain Standalone stdio MCP Server
 * 
 * This runs the LexBrain server logic directly in stdio mode for MCP.
 * No separate HTTP server needed.
 */

import { DbManager } from './packages/server/dist/db.js';
import { sha256, factId } from './packages/server/dist/crypto.js';
import { PutRequest, GetRequest, LockRequest, UnlockRequest } from './packages/server/dist/types.js';

// Configuration
const config = {
  dbPath: process.env.LEXBRAIN_DB || './thoughts.db',
  mode: process.env.LEXBRAIN_MODE || 'local',
  keyHex: process.env.LEXBRAIN_KEY_HEX,
  ttlDays: parseInt(process.env.LEXBRAIN_TTL_DAYS || '7'),
  maxPayloadKb: parseInt(process.env.LEXBRAIN_MAX_PAYLOAD_KB || '256'),
};

// Initialize database
const db = new DbManager(config.dbPath);

// MCP stdio protocol
process.stdin.setEncoding('utf8');
let buffer = '';

process.stdin.on('data', async (chunk) => {
  buffer += chunk;
  const lines = buffer.split('\n');
  buffer = lines.pop() || '';

  for (const line of lines) {
    if (!line.trim()) continue;
    
    try {
      const request = JSON.parse(line);
      const response = await handleRequest(request);
      console.log(JSON.stringify(response));
    } catch (error) {
      console.log(JSON.stringify({
        error: { message: error.message }
      }));
    }
  }
});

async function handleRequest(request) {
  const { method, params } = request;

  if (method === 'tools/list') {
    return {
      tools: [
        {
          name: 'thought.put',
          description: 'Append a fact to the knowledge store',
          inputSchema: {
            type: 'object',
            required: ['kind', 'scope', 'inputs_hash', 'payload'],
            properties: {
              kind: { 
                type: 'string',
                enum: ['repo_scan', 'dep_graph', 'dep_score', 'plan', 'merge_order', 'gate_result', 'artifact', 'note']
              },
              scope: {
                type: 'object',
                required: ['repo', 'commit'],
                properties: {
                  repo: { type: 'string' },
                  commit: { type: 'string' },
                  path: { type: 'string' },
                  symbol: { type: 'string' }
                }
              },
              inputs_hash: { type: 'string' },
              payload: {},
              confidence: { type: 'number' },
              ttl_seconds: { type: 'integer', minimum: 60 },
              actor: {},
              refs: { type: 'array', items: { type: 'string' } }
            }
          }
        },
        {
          name: 'thought.get',
          description: 'Query facts from the knowledge store',
          inputSchema: {
            type: 'object',
            required: ['repo', 'commit', 'kind'],
            properties: {
              repo: { type: 'string' },
              commit: { type: 'string' },
              kind: { 
                type: 'string',
                enum: ['repo_scan', 'dep_graph', 'dep_score', 'plan', 'merge_order', 'gate_result', 'artifact', 'note']
              },
              path: { type: 'string' },
              symbol: { type: 'string' },
              inputs_hash: { type: 'string' }
            }
          }
        },
        {
          name: 'thought.lock',
          description: 'Acquire an advisory lock',
          inputSchema: {
            type: 'object',
            required: ['name'],
            properties: {
              name: { type: 'string' }
            }
          }
        },
        {
          name: 'thought.unlock',
          description: 'Release an advisory lock',
          inputSchema: {
            type: 'object',
            required: ['name'],
            properties: {
              name: { type: 'string' }
            }
          }
        }
      ]
    };
  }

  if (method === 'tools/call') {
    const { name, arguments: args } = params;

    switch (name) {
      case 'thought.put': {
        const parsed = PutRequest.parse(args);
        const payloadHash = sha256(parsed.payload);
        const fid = factId(parsed.kind, parsed.scope, parsed.inputs_hash, payloadHash);
        
        const ttlSeconds = parsed.ttl_seconds || config.ttlDays * 86400;
        const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;

        const inserted = db.insertFact({
          fact_id: fid,
          kind: parsed.kind,
          repo: parsed.scope.repo,
          commit: parsed.scope.commit,
          path: parsed.scope.path || null,
          symbol: parsed.scope.symbol || null,
          inputs_hash: parsed.inputs_hash,
          payload_hash: payloadHash,
          payload: JSON.stringify(parsed.payload),
          confidence: parsed.confidence ?? null,
          actor: parsed.actor ? JSON.stringify(parsed.actor) : null,
          refs: parsed.refs ? JSON.stringify(parsed.refs) : null,
          expires_at: expiresAt,
        });

        return {
          content: [{
            type: 'text',
            text: `Fact stored: ${fid}\nInserted: ${inserted}`
          }]
        };
      }

      case 'thought.get': {
        const parsed = GetRequest.parse(args);
        const facts = db.getFacts({
          repo: parsed.repo,
          commit: parsed.commit,
          kind: parsed.kind,
          path: parsed.path,
          symbol: parsed.symbol,
          inputs_hash: parsed.inputs_hash,
        });

        return {
          content: [{
            type: 'text',
            text: `Found ${facts.length} facts:\n${JSON.stringify(facts, null, 2)}`
          }]
        };
      }

      case 'thought.lock': {
        const parsed = LockRequest.parse(args);
        const acquired = db.acquireLock(parsed.name);
        return {
          content: [{
            type: 'text',
            text: acquired ? `Lock "${parsed.name}" acquired` : `Lock "${parsed.name}" already held`
          }]
        };
      }

      case 'thought.unlock': {
        const parsed = UnlockRequest.parse(args);
        const released = db.releaseLock(parsed.name);
        return {
          content: [{
            type: 'text',
            text: released ? `Lock "${parsed.name}" released` : `Lock "${parsed.name}" was not held`
          }]
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  throw new Error(`Unknown method: ${method}`);
}

console.error('[LexBrain stdio MCP] Server started');
console.error(`[LexBrain stdio MCP] Database: ${config.dbPath}`);
console.error(`[LexBrain stdio MCP] Mode: ${config.mode}`);
