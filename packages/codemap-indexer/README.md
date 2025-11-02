# codemap-indexer

Tools for extracting and analyzing module neighborhoods from LexMap policies and adjacency graphs.

## Overview

This package provides functionality to extract N-hop neighborhoods from module dependency graphs, combining adjacency information with policy metadata.

## Installation

This package is part of the LexBrain monorepo and can be used by other packages in the workspace.

## API

### `extractNeighborhood`

Extract a neighborhood of modules from an adjacency graph.

```typescript
function extractNeighborhood(
  seedModules: string[],
  adjacencyGraph: AdjacencyGraph,
  policy: Policy,
  foldRadius: number = 1
): NeighborhoodData
```

#### Parameters

- **`seedModules`** (string[]): Array of module IDs to start from
- **`adjacencyGraph`** (AdjacencyGraph): Graph representing module connections
- **`policy`** (Policy): Policy file containing module metadata
- **`foldRadius`** (number, default: 1): Number of hops to expand

#### Returns

Returns a `NeighborhoodData` object containing:

```typescript
{
  seed_modules: string[];      // Original seed modules
  fold_radius: number;         // The fold radius used
  modules: ModuleData[];       // All modules in the neighborhood
}
```

Each `ModuleData` includes:
- `id`: Module identifier
- `coords`: 2D spatial coordinates
- `allowed_callers`: Modules permitted to call this module
- `forbidden_callers`: Modules forbidden from calling this module
- `feature_flags`: Associated feature flags
- `requires_permissions`: Required permissions
- `kill_patterns`: Patterns to avoid

## Usage Example

```typescript
import { extractNeighborhood } from 'codemap-indexer';
import type { Policy, AdjacencyGraph } from 'codemap-indexer';

const policy: Policy = {
  version: '1.0.0',
  modules: {
    'ui/dashboard': {
      coords: [0, 0],
      allowed_callers: []
    },
    'api/users': {
      coords: [1, 0],
      allowed_callers: ['ui/dashboard']
    }
  }
};

const graph: AdjacencyGraph = {
  'ui/dashboard': new Set(['api/users']),
  'api/users': new Set()
};

// Extract 1-hop neighborhood
const neighborhood = extractNeighborhood(
  ['ui/dashboard'],
  graph,
  policy,
  1
);

console.log(neighborhood);
// {
//   seed_modules: ['ui/dashboard'],
//   fold_radius: 1,
//   modules: [
//     { id: 'api/users', coords: [1, 0], ... },
//     { id: 'ui/dashboard', coords: [0, 0], ... }
//   ]
// }
```

## Features

- **N-hop expansion**: Extract neighborhoods of any depth
- **Circular dependency handling**: Correctly handles cycles without duplicating modules
- **Isolated module support**: Works with modules that have no connections
- **Validation**: Validates seed modules exist in policy
- **Sorted output**: Returns modules in alphabetical order for consistency

## Testing

Run the test suite:

```bash
pnpm test
```

The test suite covers:
- Single and multi-hop expansions
- Multiple seed modules
- Circular dependencies
- Isolated modules
- Edge cases (empty seeds, negative radius, etc.)
- Various graph topologies

## Integration with LexBrain

This package is designed to work with LexMap policy files and supports the LexBrain Frame system by:

1. Extracting relevant module neighborhoods based on touched files
2. Providing complete policy metadata for each module
3. Supporting impact analysis through fold radius expansion

## License

MIT
