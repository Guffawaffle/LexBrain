import { z } from 'zod';

// ThoughtKind union type
export const ThoughtKind = z.enum([
  'repo_scan',
  'dep_graph',
  'dep_score',
  'plan',
  'merge_order',
  'gate_result',
  'artifact',
  'note'
]);

export type ThoughtKind = z.infer<typeof ThoughtKind>;

// Scope schema
export const Scope = z.object({
  repo: z.string(),
  commit: z.string(),
  path: z.string().optional(),
  symbol: z.string().optional()
});

export type Scope = z.infer<typeof Scope>;

// ThoughtFact schema
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

// Request schemas
export const PutRequest = z.object({
  kind: ThoughtKind,
  scope: Scope,
  inputs_hash: z.string(),
  payload: z.unknown(),
  confidence: z.number().optional(),
  ttl_seconds: z.number().optional(),
  actor: z.unknown().optional(),
  refs: z.array(z.string()).optional()
});

export type PutRequest = z.infer<typeof PutRequest>;

export const GetRequest = z.object({
  repo: z.string(),
  commit: z.string(),
  kind: ThoughtKind,
  path: z.string().optional(),
  symbol: z.string().optional(),
  inputs_hash: z.string().optional()
});

export type GetRequest = z.infer<typeof GetRequest>;

export const LockRequest = z.object({
  name: z.string()
});

export type LockRequest = z.infer<typeof LockRequest>;

export const UnlockRequest = z.object({
  name: z.string()
});

export type UnlockRequest = z.infer<typeof UnlockRequest>;

// Response schemas
export const PutResponse = z.object({
  fact_id: z.string(),
  inserted: z.boolean()
});

export type PutResponse = z.infer<typeof PutResponse>;

export const LockResponse = z.object({
  ok: z.boolean()
});

export type LockResponse = z.infer<typeof LockResponse>;

export const UnlockResponse = z.object({
  ok: z.boolean()
});

export type UnlockResponse = z.infer<typeof UnlockResponse>;
