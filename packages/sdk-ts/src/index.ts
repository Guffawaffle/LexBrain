import crypto from 'crypto';
import { z } from 'zod';

// Type definitions (duplicated from server to avoid build dependencies)
export const ThoughtKind = z.enum([
  'repo_scan',
  'dep_graph',
  'dep_score',
  'plan',
  'merge_order',
  'gate_result',
  'artifact',
  'note',
  'frame'
]);

export type ThoughtKind = z.infer<typeof ThoughtKind>;

export const Scope = z.object({
  repo: z.string(),
  commit: z.string(),
  path: z.string().optional(),
  symbol: z.string().optional()
});

export type Scope = z.infer<typeof Scope>;

export const ThoughtFact = z.object({
  fact_id: z.string(),
  kind: ThoughtKind,
  scope: Scope,
  inputs_hash: z.string(),
  payload: z.unknown(),
  confidence: z.number().optional(),
  ts: z.string(),
  ttl_seconds: z.number().optional(),
  actor: z.unknown().optional(),
  refs: z.array(z.string()).optional()
});

export type ThoughtFact = z.infer<typeof ThoughtFact>;

// Frame schema - represents a work session snapshot
export const FrameStatusSnapshot = z.object({
  next_action: z.string(),
  blockers: z.array(z.string()).optional(),
  merge_blockers: z.array(z.string()).optional()
});

export type FrameStatusSnapshot = z.infer<typeof FrameStatusSnapshot>;

export const Frame = z.object({
  id: z.string(),
  timestamp: z.string(),
  branch: z.string(),
  jira: z.string().optional(),
  module_scope: z.array(z.string()),
  summary_caption: z.string(),
  reference_point: z.string(),
  status_snapshot: FrameStatusSnapshot,
  keywords: z.array(z.string()).optional(),
  atlas_frame_id: z.string().optional()
});

export type Frame = z.infer<typeof Frame>;

// Client configuration
export interface LexBrainOptions {
  url: string;
  mode: 'local' | 'zk';
  keyHex?: string;
  timeoutMs?: number;
}

// Put request interface
export interface PutFactRequest {
  kind: ThoughtKind;
  scope: Scope;
  inputs_hash: string;
  payload: unknown;
  confidence?: number;
  ttl_seconds?: number;
  actor?: unknown;
  refs?: string[];
}

// Get request interface
export interface GetFactsRequest {
  repo: string;
  commit: string;
  kind: ThoughtKind;
  path?: string;
  symbol?: string;
  inputs_hash?: string;
}

// Response interfaces
export interface PutResponse {
  fact_id: string;
  inserted: boolean;
}

export interface LockResponse {
  ok: boolean;
}

// Crypto utilities (duplicated from server)
function sha256(obj: any): string {
  const jsonStr = JSON.stringify(obj, Object.keys(obj).sort());
  return crypto.createHash('sha256').update(jsonStr, 'utf8').digest('hex');
}

function encryptZk(keyHex: string, plaintext: Uint8Array, aad: string): { iv: string; ct: string } {
  const key = Buffer.from(keyHex, 'hex');
  const iv = crypto.randomBytes(16); // 128-bit IV for CBC

  // For simplicity, use CBC mode and prepend AAD to plaintext
  const aadBuffer = Buffer.from(aad, 'utf8');
  const dataWithAad = Buffer.concat([
    Buffer.from(aadBuffer.length.toString().padStart(8, '0'), 'utf8'),
    aadBuffer,
    plaintext
  ]);

  const cipher = crypto.createCipher('aes-256-cbc', key);
  const encrypted = Buffer.concat([
    cipher.update(dataWithAad),
    cipher.final()
  ]);

  return {
    iv: iv.toString('base64'),
    ct: encrypted.toString('base64')
  };
}function decryptZk(keyHex: string, ivB64: string, ctB64: string, aad: string): Uint8Array {
  const key = Buffer.from(keyHex, 'hex');
  const iv = Buffer.from(ivB64, 'base64');
  const ciphertext = Buffer.from(ctB64, 'base64');

  const decipher = crypto.createDecipher('aes-256-cbc', key);
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final()
  ]);

  // Extract AAD and verify
  const aadLengthStr = decrypted.subarray(0, 8).toString('utf8');
  const aadLength = parseInt(aadLengthStr);
  const extractedAad = decrypted.subarray(8, 8 + aadLength).toString('utf8');

  if (extractedAad !== aad) {
    throw new Error('AAD verification failed');
  }

  const plaintext = decrypted.subarray(8 + aadLength);
  return new Uint8Array(plaintext);
}

export class LexBrain {
  private url: string;
  private mode: 'local' | 'zk';
  private keyHex?: string;
  private timeoutMs: number;

  constructor(options: LexBrainOptions) {
    this.url = options.url.replace(/\/$/, ''); // Remove trailing slash
    this.mode = options.mode;
    this.keyHex = options.keyHex;
    this.timeoutMs = options.timeoutMs || 30000;

    // Validate ZK mode configuration
    if (this.mode === 'zk') {
      if (!this.keyHex) {
        throw new Error('keyHex is required for ZK mode');
      }
      if (this.keyHex.length !== 64) {
        throw new Error('keyHex must be exactly 64 hex characters (32 bytes)');
      }
    }
  }

  /**
   * Generate deterministic inputs hash
   */
  static inputsHash(raw: unknown): string {
    return sha256(raw);
  }

  /**
   * Generate deterministic fact ID
   */
  static factId(kind: string, scope: Scope, inputs_hash: string, payload_hash: string): string {
    const components = {
      kind,
      scope,
      inputs_hash,
      payload_hash
    };
    return sha256(components);
  }

  /**
   * Store a fact
   */
  async put(fact: PutFactRequest): Promise<PutResponse> {
    let payloadToSend: unknown;
    let payloadHash: string;

    if (this.mode === 'zk' && this.keyHex) {
      // Encrypt payload client-side
      const plaintextBytes = new TextEncoder().encode(JSON.stringify(fact.payload));

      // Pre-compute fact ID with placeholder to use as AAD
      const placeholderHash = sha256('placeholder');
      const preliminaryFactId = LexBrain.factId(fact.kind, fact.scope, fact.inputs_hash, placeholderHash);

      // Encrypt with fact ID as AAD
      const encrypted = encryptZk(this.keyHex, plaintextBytes, preliminaryFactId);

      // Now compute actual payload hash and fact ID
      payloadHash = sha256(encrypted.ct);
      payloadToSend = {
        ciphertext: encrypted.ct,
        iv: encrypted.iv
      };
    } else {
      // Local mode - send plaintext
      payloadToSend = fact.payload;
      payloadHash = sha256(fact.payload);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.url}/put`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...fact,
          payload: payloadToSend
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(`PUT failed: ${error.error || response.statusText}`);
      }

      return await response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Query facts
   */
  async get(query: GetFactsRequest): Promise<ThoughtFact[]> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.url}/get`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(query),
        signal: controller.signal
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(`GET failed: ${error.error || response.statusText}`);
      }

      const facts: ThoughtFact[] = await response.json();

      // In ZK mode, add decrypt helper to each fact
      if (this.mode === 'zk' && this.keyHex) {
        return facts.map(fact => ({
          ...fact,
          // Add a decrypt method to the payload if it's encrypted
          decrypt: (payload: any) => {
            if (payload && typeof payload === 'object' && payload.ciphertext && payload.iv) {
              try {
                const decrypted = decryptZk(this.keyHex!, payload.iv, payload.ciphertext, fact.fact_id);
                return JSON.parse(new TextDecoder().decode(decrypted));
              } catch (error) {
                throw new Error('Failed to decrypt payload');
              }
            }
            return payload;
          }
        } as any));
      }

      return facts;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Acquire advisory lock
   */
  async lock(name: string, ttlMs: number = 60000): Promise<boolean> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), Math.min(ttlMs, this.timeoutMs));

    try {
      const response = await fetch(`${this.url}/lock`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name }),
        signal: controller.signal
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(`LOCK failed: ${error.error || response.statusText}`);
      }

      const result: LockResponse = await response.json();
      return result.ok;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Release advisory lock
   */
  async unlock(name: string): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.url}/unlock`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name }),
        signal: controller.signal
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(`UNLOCK failed: ${error.error || response.statusText}`);
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
