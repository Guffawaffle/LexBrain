/**
 * Types for LexMap policy and adjacency graph structures
 */

/**
 * Module metadata from the policy file
 */
export interface ModuleMetadata {
  coords: [number, number];
  description?: string;
  owns_paths?: string[];
  allowed_callers?: string[];
  forbidden_callers?: string[];
  feature_flags?: string[];
  requires_permissions?: string[];
  kill_patterns?: string[];
}

/**
 * Complete policy file structure
 */
export interface Policy {
  version: string;
  metadata?: {
    description?: string;
    last_updated?: string;
    maintainers?: string[];
  };
  modules: Record<string, ModuleMetadata>;
}

/**
 * Adjacency graph representing module dependencies
 * Maps each module ID to a set of module IDs it depends on or is connected to
 */
export interface AdjacencyGraph {
  [moduleId: string]: Set<string>;
}

/**
 * Module data with full policy metadata for neighborhood export
 */
export interface ModuleData {
  id: string;
  coords: [number, number];
  allowed_callers: string[];
  forbidden_callers: string[];
  feature_flags: string[];
  requires_permissions: string[];
  kill_patterns: string[];
}

/**
 * Neighborhood extraction result
 */
export interface NeighborhoodData {
  seed_modules: string[];
  fold_radius: number;
  modules: ModuleData[];
}
