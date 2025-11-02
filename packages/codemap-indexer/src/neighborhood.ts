import type { Policy, AdjacencyGraph, NeighborhoodData, ModuleData, ModuleMetadata } from './types.js';

/**
 * Extract a neighborhood of modules from an adjacency graph
 * 
 * @param seedModules - Array of module IDs to start from
 * @param adjacencyGraph - Graph representing module connections
 * @param policy - Policy file containing module metadata
 * @param foldRadius - Number of hops to expand (default: 1)
 * @returns NeighborhoodData containing all modules within the fold radius
 */
export function extractNeighborhood(
  seedModules: string[],
  adjacencyGraph: AdjacencyGraph,
  policy: Policy,
  foldRadius: number = 1
): NeighborhoodData {
  // Validate inputs
  if (seedModules.length === 0) {
    throw new Error('seedModules cannot be empty');
  }
  
  if (foldRadius < 0) {
    throw new Error('foldRadius must be non-negative');
  }

  // Validate all seed modules exist in the policy
  for (const moduleId of seedModules) {
    if (!policy.modules[moduleId]) {
      throw new Error(`Seed module "${moduleId}" not found in policy`);
    }
  }

  // Track all modules to include in the neighborhood
  const modulesInNeighborhood = new Set<string>(seedModules);
  
  // BFS to expand N hops
  let currentLevel = new Set<string>(seedModules);
  
  for (let hop = 0; hop < foldRadius; hop++) {
    const nextLevel = new Set<string>();
    
    for (const moduleId of currentLevel) {
      // Get neighbors from adjacency graph
      const neighbors = adjacencyGraph[moduleId];
      
      if (neighbors) {
        for (const neighbor of neighbors) {
          // Only add if not already in neighborhood and exists in policy
          if (!modulesInNeighborhood.has(neighbor) && policy.modules[neighbor]) {
            nextLevel.add(neighbor);
            modulesInNeighborhood.add(neighbor);
          }
        }
      }
    }
    
    // Move to next level
    currentLevel = nextLevel;
    
    // Stop if no more nodes to expand
    if (nextLevel.size === 0) {
      break;
    }
  }

  // Build module data array with full metadata
  const modules: ModuleData[] = Array.from(modulesInNeighborhood)
    .sort() // Sort for consistent output
    .map(moduleId => {
      const metadata = policy.modules[moduleId];
      return buildModuleData(moduleId, metadata);
    });

  return {
    seed_modules: seedModules,
    fold_radius: foldRadius,
    modules
  };
}

/**
 * Build ModuleData from module ID and metadata
 */
function buildModuleData(id: string, metadata: ModuleMetadata): ModuleData {
  return {
    id,
    coords: metadata.coords,
    allowed_callers: metadata.allowed_callers || [],
    forbidden_callers: metadata.forbidden_callers || [],
    feature_flags: metadata.feature_flags || [],
    requires_permissions: metadata.requires_permissions || [],
    kill_patterns: metadata.kill_patterns || []
  };
}
