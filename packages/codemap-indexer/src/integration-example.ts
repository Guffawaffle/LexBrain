/**
 * Example: Using extractNeighborhood with the actual lexmap.policy.json
 * 
 * This demonstrates how to load the policy file and build an adjacency graph
 * from the allowed_callers relationships.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { extractNeighborhood } from './index.js';
import type { Policy, AdjacencyGraph } from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load the actual policy file from the repository root
const policyPath = join(__dirname, '../../../lexmap.policy.json');
const policy: Policy = JSON.parse(readFileSync(policyPath, 'utf-8'));

/**
 * Build an adjacency graph from the policy's allowed_callers relationships.
 * This creates edges from callers to the modules they can call.
 */
function buildAdjacencyGraphFromPolicy(policy: Policy): AdjacencyGraph {
  const graph: AdjacencyGraph = {};
  
  // Initialize empty sets for all modules
  for (const moduleId of Object.keys(policy.modules)) {
    graph[moduleId] = new Set();
  }
  
  // Build edges: if module A is in B's allowed_callers, add edge A -> B
  for (const [targetModuleId, metadata] of Object.entries(policy.modules)) {
    if (metadata.allowed_callers) {
      for (const callerModuleId of metadata.allowed_callers) {
        if (graph[callerModuleId]) {
          graph[callerModuleId].add(targetModuleId);
        }
      }
    }
  }
  
  return graph;
}

// Build the adjacency graph
const graph = buildAdjacencyGraphFromPolicy(policy);

console.log('=== LexMap Policy Analysis ===\n');
console.log(`Loaded policy version: ${policy.version}`);
console.log(`Total modules: ${Object.keys(policy.modules).length}\n`);

// Example 1: Extract neighborhood around ui/user-admin-panel
console.log('=== Example: 1-hop neighborhood from ui/user-admin-panel ===');
const neighborhood1 = extractNeighborhood(
  ['ui/user-admin-panel'],
  graph,
  policy,
  1
);

console.log(`Found ${neighborhood1.modules.length} modules:`);
for (const module of neighborhood1.modules) {
  console.log(`  - ${module.id} at coords ${JSON.stringify(module.coords)}`);
  if (module.feature_flags.length > 0) {
    console.log(`    Feature flags: ${module.feature_flags.join(', ')}`);
  }
}

console.log('\n=== Example: 2-hop neighborhood from ui/admin-dashboard ===');
const neighborhood2 = extractNeighborhood(
  ['ui/admin-dashboard'],
  graph,
  policy,
  2
);

console.log(`Found ${neighborhood2.modules.length} modules:`);
console.log(`Module IDs: ${neighborhood2.modules.map(m => m.id).join(', ')}`);

// Example 3: Multi-module seed
console.log('\n=== Example: Neighborhood from both UI modules ===');
const neighborhood3 = extractNeighborhood(
  ['ui/user-admin-panel', 'ui/admin-dashboard'],
  graph,
  policy,
  1
);

console.log(`Found ${neighborhood3.modules.length} modules in combined neighborhood`);
