/**
 * Example demonstrating the extractNeighborhood function
 */

import { extractNeighborhood } from './index.js';
import type { Policy, AdjacencyGraph } from './index.js';

// Example policy (simplified from lexmap.policy.json)
const examplePolicy: Policy = {
  version: '1.0.0',
  modules: {
    'ui/user-admin-panel': {
      coords: [0, 2],
      description: 'User administration UI panel',
      allowed_callers: [],
      forbidden_callers: ['services/auth-core'],
      feature_flags: ['beta_user_admin'],
      requires_permissions: ['can_manage_users'],
      kill_patterns: ['duplicate_auth_logic']
    },
    'services/user-access-api': {
      coords: [1, 2],
      description: 'API layer for user access control',
      allowed_callers: ['ui/user-admin-panel'],
      feature_flags: ['beta_user_admin'],
      requires_permissions: ['can_manage_users']
    },
    'services/auth-core': {
      coords: [2, 2],
      description: 'Core authentication service',
      allowed_callers: ['services/user-access-api']
    },
    'data/user-store': {
      coords: [3, 2],
      description: 'User data persistence layer',
      allowed_callers: ['services/auth-core']
    }
  }
};

// Example adjacency graph representing dependencies
// (module -> modules it depends on/calls)
const exampleGraph: AdjacencyGraph = {
  'ui/user-admin-panel': new Set(['services/user-access-api']),
  'services/user-access-api': new Set(['services/auth-core']),
  'services/auth-core': new Set(['data/user-store']),
  'data/user-store': new Set()
};

// Extract 1-hop neighborhood from the UI module
console.log('\n=== Example 1: 1-hop neighborhood from UI module ===');
const neighborhood1 = extractNeighborhood(
  ['ui/user-admin-panel'],
  exampleGraph,
  examplePolicy,
  1
);
console.log(JSON.stringify(neighborhood1, null, 2));

// Extract 2-hop neighborhood
console.log('\n=== Example 2: 2-hop neighborhood from UI module ===');
const neighborhood2 = extractNeighborhood(
  ['ui/user-admin-panel'],
  exampleGraph,
  examplePolicy,
  2
);
console.log(`Found ${neighborhood2.modules.length} modules within 2 hops`);
console.log('Module IDs:', neighborhood2.modules.map(m => m.id));

// Extract from multiple seed modules
console.log('\n=== Example 3: Multiple seed modules ===');
const neighborhood3 = extractNeighborhood(
  ['ui/user-admin-panel', 'data/user-store'],
  exampleGraph,
  examplePolicy,
  1
);
console.log(`Found ${neighborhood3.modules.length} modules`);
console.log('Module IDs:', neighborhood3.modules.map(m => m.id));
