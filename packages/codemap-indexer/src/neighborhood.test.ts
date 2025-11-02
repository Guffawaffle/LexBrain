import { test } from 'node:test';
import assert from 'node:assert';
import { extractNeighborhood } from './neighborhood.js';
import type { Policy, AdjacencyGraph } from './types.js';

// Test fixture: Simple policy
const simplePolicy: Policy = {
  version: '1.0.0',
  modules: {
    'ui/user-admin-panel': {
      coords: [0, 2],
      allowed_callers: [],
      forbidden_callers: ['services/auth-core'],
      feature_flags: ['beta_user_admin'],
      requires_permissions: ['can_manage_users'],
      kill_patterns: ['duplicate_auth_logic']
    },
    'services/user-access-api': {
      coords: [1, 2],
      allowed_callers: ['ui/user-admin-panel'],
      feature_flags: ['beta_user_admin'],
      requires_permissions: ['can_manage_users']
    },
    'services/auth-core': {
      coords: [2, 2],
      allowed_callers: ['services/user-access-api']
    },
    'data/user-store': {
      coords: [3, 2],
      allowed_callers: ['services/auth-core']
    }
  }
};

// Test fixture: Simple linear adjacency graph (ui -> api -> auth -> data)
const linearGraph: AdjacencyGraph = {
  'ui/user-admin-panel': new Set(['services/user-access-api']),
  'services/user-access-api': new Set(['services/auth-core']),
  'services/auth-core': new Set(['data/user-store']),
  'data/user-store': new Set()
};

// Test fixture: Circular dependency graph
const circularGraph: AdjacencyGraph = {
  'ui/user-admin-panel': new Set(['services/user-access-api']),
  'services/user-access-api': new Set(['services/auth-core']),
  'services/auth-core': new Set(['ui/user-admin-panel']) // Creates a cycle
};

// Test fixture: Isolated module
const isolatedPolicy: Policy = {
  version: '1.0.0',
  modules: {
    'isolated-module': {
      coords: [0, 0]
    },
    'connected-a': {
      coords: [1, 0]
    },
    'connected-b': {
      coords: [2, 0]
    }
  }
};

const isolatedGraph: AdjacencyGraph = {
  'isolated-module': new Set(),
  'connected-a': new Set(['connected-b']),
  'connected-b': new Set(['connected-a'])
};

test('extractNeighborhood: 1-hop from single seed', () => {
  const result = extractNeighborhood(
    ['ui/user-admin-panel'],
    linearGraph,
    simplePolicy,
    1
  );

  assert.deepStrictEqual(result.seed_modules, ['ui/user-admin-panel']);
  assert.strictEqual(result.fold_radius, 1);
  assert.strictEqual(result.modules.length, 2);
  
  const moduleIds = result.modules.map(m => m.id);
  assert.ok(moduleIds.includes('ui/user-admin-panel'));
  assert.ok(moduleIds.includes('services/user-access-api'));
  
  // Verify module data structure
  const uiModule = result.modules.find(m => m.id === 'ui/user-admin-panel');
  assert.ok(uiModule);
  assert.deepStrictEqual(uiModule.coords, [0, 2]);
  assert.deepStrictEqual(uiModule.forbidden_callers, ['services/auth-core']);
  assert.deepStrictEqual(uiModule.feature_flags, ['beta_user_admin']);
  assert.deepStrictEqual(uiModule.requires_permissions, ['can_manage_users']);
  assert.deepStrictEqual(uiModule.kill_patterns, ['duplicate_auth_logic']);
});

test('extractNeighborhood: default fold radius is 1', () => {
  const result = extractNeighborhood(
    ['ui/user-admin-panel'],
    linearGraph,
    simplePolicy
  );

  assert.strictEqual(result.fold_radius, 1);
  assert.strictEqual(result.modules.length, 2);
});

test('extractNeighborhood: 2-hop expansion', () => {
  const result = extractNeighborhood(
    ['ui/user-admin-panel'],
    linearGraph,
    simplePolicy,
    2
  );

  assert.strictEqual(result.fold_radius, 2);
  assert.strictEqual(result.modules.length, 3);
  
  const moduleIds = result.modules.map(m => m.id);
  assert.ok(moduleIds.includes('ui/user-admin-panel'));
  assert.ok(moduleIds.includes('services/user-access-api'));
  assert.ok(moduleIds.includes('services/auth-core'));
});

test('extractNeighborhood: 0-hop returns only seed', () => {
  const result = extractNeighborhood(
    ['ui/user-admin-panel'],
    linearGraph,
    simplePolicy,
    0
  );

  assert.strictEqual(result.fold_radius, 0);
  assert.strictEqual(result.modules.length, 1);
  assert.strictEqual(result.modules[0].id, 'ui/user-admin-panel');
});

test('extractNeighborhood: multiple seed modules', () => {
  const result = extractNeighborhood(
    ['ui/user-admin-panel', 'services/auth-core'],
    linearGraph,
    simplePolicy,
    1
  );

  assert.deepStrictEqual(result.seed_modules, ['ui/user-admin-panel', 'services/auth-core']);
  assert.strictEqual(result.modules.length, 4); // ui, api, auth, data
  
  const moduleIds = result.modules.map(m => m.id);
  assert.ok(moduleIds.includes('ui/user-admin-panel'));
  assert.ok(moduleIds.includes('services/user-access-api'));
  assert.ok(moduleIds.includes('services/auth-core'));
  assert.ok(moduleIds.includes('data/user-store'));
});

test('extractNeighborhood: handles circular dependencies', () => {
  const result = extractNeighborhood(
    ['ui/user-admin-panel'],
    circularGraph,
    simplePolicy,
    3 // Try expanding 3 hops in a 3-node cycle
  );

  // Should include all 3 modules in the cycle, but not duplicate
  assert.strictEqual(result.modules.length, 3);
  
  const moduleIds = result.modules.map(m => m.id);
  assert.ok(moduleIds.includes('ui/user-admin-panel'));
  assert.ok(moduleIds.includes('services/user-access-api'));
  assert.ok(moduleIds.includes('services/auth-core'));
});

test('extractNeighborhood: isolated module with 1-hop', () => {
  const result = extractNeighborhood(
    ['isolated-module'],
    isolatedGraph,
    isolatedPolicy,
    1
  );

  // Isolated module has no neighbors
  assert.strictEqual(result.modules.length, 1);
  assert.strictEqual(result.modules[0].id, 'isolated-module');
});

test('extractNeighborhood: large fold radius stops when graph exhausted', () => {
  const result = extractNeighborhood(
    ['ui/user-admin-panel'],
    linearGraph,
    simplePolicy,
    100 // Much larger than the graph depth
  );

  // Should return all connected modules (all 4 in the linear chain)
  assert.strictEqual(result.modules.length, 4);
});

test('extractNeighborhood: throws on empty seed modules', () => {
  assert.throws(
    () => extractNeighborhood([], linearGraph, simplePolicy, 1),
    /seedModules cannot be empty/
  );
});

test('extractNeighborhood: throws on negative fold radius', () => {
  assert.throws(
    () => extractNeighborhood(['ui/user-admin-panel'], linearGraph, simplePolicy, -1),
    /foldRadius must be non-negative/
  );
});

test('extractNeighborhood: throws on non-existent seed module', () => {
  assert.throws(
    () => extractNeighborhood(['non-existent-module'], linearGraph, simplePolicy, 1),
    /Seed module "non-existent-module" not found in policy/
  );
});

test('extractNeighborhood: ignores neighbors not in policy', () => {
  const graphWithUnknownModule: AdjacencyGraph = {
    'ui/user-admin-panel': new Set(['services/user-access-api', 'unknown-module']),
    'services/user-access-api': new Set()
  };

  const result = extractNeighborhood(
    ['ui/user-admin-panel'],
    graphWithUnknownModule,
    simplePolicy,
    1
  );

  // Should only include modules that exist in the policy
  assert.strictEqual(result.modules.length, 2);
  const moduleIds = result.modules.map(m => m.id);
  assert.ok(moduleIds.includes('ui/user-admin-panel'));
  assert.ok(moduleIds.includes('services/user-access-api'));
  assert.ok(!moduleIds.includes('unknown-module'));
});

test('extractNeighborhood: modules sorted alphabetically', () => {
  const result = extractNeighborhood(
    ['ui/user-admin-panel'],
    linearGraph,
    simplePolicy,
    2
  );

  const moduleIds = result.modules.map(m => m.id);
  const sortedIds = [...moduleIds].sort();
  assert.deepStrictEqual(moduleIds, sortedIds);
});

test('extractNeighborhood: includes all metadata fields', () => {
  const result = extractNeighborhood(
    ['ui/user-admin-panel'],
    linearGraph,
    simplePolicy,
    0
  );

  const module = result.modules[0];
  assert.ok(module.id);
  assert.ok(Array.isArray(module.coords));
  assert.ok(Array.isArray(module.allowed_callers));
  assert.ok(Array.isArray(module.forbidden_callers));
  assert.ok(Array.isArray(module.feature_flags));
  assert.ok(Array.isArray(module.requires_permissions));
  assert.ok(Array.isArray(module.kill_patterns));
});

test('extractNeighborhood: empty arrays for missing optional fields', () => {
  const minimalPolicy: Policy = {
    version: '1.0.0',
    modules: {
      'minimal-module': {
        coords: [0, 0]
      }
    }
  };

  const minimalGraph: AdjacencyGraph = {
    'minimal-module': new Set()
  };

  const result = extractNeighborhood(
    ['minimal-module'],
    minimalGraph,
    minimalPolicy,
    0
  );

  const module = result.modules[0];
  assert.deepStrictEqual(module.allowed_callers, []);
  assert.deepStrictEqual(module.forbidden_callers, []);
  assert.deepStrictEqual(module.feature_flags, []);
  assert.deepStrictEqual(module.requires_permissions, []);
  assert.deepStrictEqual(module.kill_patterns, []);
});
