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
  'note',
  'frame'
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

// Atlas Frame schema - structural snapshot of module neighborhood
export const AtlasModule = z.object({
  id: z.string(),
  coordinates: z.object({
    x: z.number(),
    y: z.number()
  }),
  layer: z.enum(['presentation', 'application', 'domain', 'infrastructure'])
});

export type AtlasModule = z.infer<typeof AtlasModule>;

export const AtlasEdge = z.object({
  from: z.string(),
  to: z.string(),
  allowed: z.boolean(),
  rule: z.string().optional()
});

export type AtlasEdge = z.infer<typeof AtlasEdge>;

export const AtlasFrame = z.object({
  atlas_frame_id: z.string(),
  frame_id: z.string(),
  atlas_timestamp: z.string(),
  reference_module: z.string(),
  fold_radius: z.number().int().min(0).max(5),
  modules: z.array(AtlasModule),
  edges: z.array(AtlasEdge),
  critical_rule: z.string().optional()
});

export type AtlasFrame = z.infer<typeof AtlasFrame>;

// Recall request and response schemas
export const RecallRequest = z.object({
  reference_point: z.string().optional(),
  jira: z.string().optional(),
  frame_id: z.string().optional()
});

export type RecallRequest = z.infer<typeof RecallRequest>;

export const RecallResponse = z.object({
  frame: Frame,
  atlas_frame: AtlasFrame.optional()
});

export type RecallResponse = z.infer<typeof RecallResponse>;
