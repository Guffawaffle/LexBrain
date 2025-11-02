# LexMap Policy Documentation

## Overview

LexMap policies define the architectural boundaries, dependencies, and permissions for modules in your codebase. Each module in `lexmap.policy.json` represents a logical unit of your system with specific responsibilities, dependencies, and spatial relationships.

## Policy File Structure

A LexMap policy file (`lexmap.policy.json`) contains:

- **modules**: A map of module IDs to their definitions
- **version**: The version of the policy schema being used
- **metadata**: Optional metadata about the policy file

### Module Definition

Each module is identified by a unique ID (e.g., `"ui/user-admin-panel"`, `"services/auth-core"`) and contains the following fields:

#### Required Fields

- **`coords`** (array of 2 numbers): 2D logical coordinates for spatial reasoning
  - Format: `[x, y]` where both x and y are numbers
  - Used for visualizing module relationships and adjacency graphs
  - Adjacent or closely-related modules should have nearby coordinates
  - Coordinates are logical positions, not pixel positions

#### Optional Fields

- **`owns_paths`** (array of strings): File path patterns that this module owns
  - Example: `["web-ui/userAdmin/**"]`
  - Used to map source files to canonical module IDs

- **`allowed_callers`** (array of strings): Module IDs permitted to call this module
  - Example: `["services/user-access-api"]`
  - Defines explicit allowed dependencies

- **`forbidden_callers`** (array of strings): Module IDs explicitly forbidden from calling this module
  - Example: `["services/auth-core"]`
  - Prevents direct dependencies that violate architecture

- **`feature_flags`** (array of strings): Feature flags associated with this module
  - Example: `["beta_user_admin"]`
  - Used for gating and rollout management

- **`requires_permissions`** (array of strings): Permissions required to access this module
  - Example: `["can_manage_users"]`
  - Used for access control and security enforcement

- **`kill_patterns`** (array of strings): Patterns to avoid or eliminate in this module
  - Example: `["duplicate_auth_logic"]`
  - Documents anti-patterns to prevent

- **`description`** (string): Human-readable description of the module's purpose

## Spatial Coordinates System

### Purpose

Spatial coordinates enable visual and topological reasoning about module relationships. They allow tools to:

- Generate visual dependency graphs with meaningful layouts
- Identify closely-related modules based on proximity
- Detect architectural violations (e.g., long-distance dependencies)
- Build adjacency graphs for impact analysis

### Coordinate Assignment Strategy

Coordinates represent **logical positions** in your architecture, not physical screen positions.

#### Guidelines for Assigning Coordinates

1. **Group related modules together**: Modules that collaborate closely should have nearby coordinates
   - Example: UI and its API layer might be at `[0, 2]` and `[1, 2]`

2. **Use layers for architectural tiers**: Organize coordinates by architectural layers
   - Layer 0 (x=0): UI/presentation layer
   - Layer 1 (x=1): API/service layer
   - Layer 2 (x=2): Core business logic
   - Layer 3 (x=3): Data persistence

3. **Use y-axis for feature domains**: Group modules by feature or domain vertically
   - Example: User management features at y=2, Admin features at y=0

4. **Keep adjacent modules near allowed dependencies**: If module A can call module B, consider placing them near each other

5. **Use consistent spacing**: Use integer coordinates with consistent gaps (e.g., 1 unit apart) for clarity

#### Example Coordinate Layout

```
         x=0              x=1                x=2               x=3
y=0   [ui/admin]  →  [admin-api]    →   [...]          →   [...]
                                            
y=1   [...]        →  [...]          →  [session-mgr]  →  [session-store]
                                            ↓
y=2   [ui/users]   →  [user-api]     →  [auth-core]    →  [user-store]
```

In this layout:
- UI modules are at x=0 (leftmost layer)
- API services are at x=1
- Core services are at x=2
- Data stores are at x=3 (rightmost layer)
- Different feature domains are separated vertically (y-axis)

### Updating Coordinates

When adding new modules:

1. Identify which architectural layer the module belongs to (determines x)
2. Identify which feature domain the module belongs to (determines y)
3. Place the module near its primary dependencies
4. Ensure coordinates don't conflict with existing modules
5. Update documentation if coordinate conventions change

## Schema Validation

The policy file must conform to the JSON Schema defined in `docs/schemas/policy.schema.json`.

### Validation Rules

- Each module **must** have a `coords` field
- `coords` must be an array of exactly 2 numbers
- Module IDs must match the pattern `^[a-zA-Z0-9/_-]+$`
- All references in `allowed_callers` and `forbidden_callers` should refer to existing module IDs

### Validating Your Policy File

You can validate your policy file using standard JSON Schema validators:

```bash
# Using ajv-cli
npx ajv-cli validate -s docs/schemas/policy.schema.json -d lexmap.policy.json

# Using online validators
# Upload both files to https://www.jsonschemavalidator.net/
```

## Example Policy File

See `lexmap.policy.json` in the root directory for a complete example demonstrating:

- Proper coordinate assignment across layers and domains
- Module dependency relationships
- Feature flag and permission annotations
- Multi-tier architecture representation

## Integration with LexBrain

LexBrain uses module IDs from `lexmap.policy.json` when capturing Frames:

1. When you modify files, LexBrain asks LexMap which modules own those files (via `owns_paths`)
2. LexBrain records the canonical module IDs in the Frame's `module_scope`
3. Later, when recalling Frames, assistants can use module IDs to understand:
   - Which parts of the system were touched
   - What dependencies exist between modules
   - What permissions and feature flags are involved

### THE CRITICAL RULE

> Every module name in LexBrain's `module_scope` MUST match the module IDs defined in `lexmap.policy.json`.

This rule ensures consistency between temporal memory (LexBrain Frames) and structural truth (LexMap policy).

## Best Practices

1. **Keep module IDs stable**: Avoid renaming module IDs frequently, as this breaks historical Frame references
2. **Document coordinate changes**: When reorganizing coordinates, document the reasoning
3. **Review dependencies regularly**: Use `allowed_callers` and `forbidden_callers` to enforce architecture
4. **Use descriptive module IDs**: Follow a consistent naming pattern (e.g., `layer/feature-name`)
5. **Update policy atomically**: When refactoring, update all related modules together
6. **Validate before committing**: Always validate the policy file against the schema

## Future Extensions

Planned enhancements to the policy schema:

- **Adjacency graph generation**: Automatic graph generation based on coordinates and dependencies
- **Visual policy editor**: GUI for editing module coordinates and relationships
- **Automatic coordinate optimization**: Algorithms to suggest optimal coordinate layouts
- **Dependency conflict detection**: Automated checks for architectural violations
- **Impact analysis**: Tools to analyze blast radius of changes using coordinates

## Related Documentation

- [LexBrain README](../README.md) - Overview of the LexBrain memory system
- [Frame Metadata Structure](../README.md#frame-metadata-structure) - How module_scope is used
- [Contributing Guide](../CONTRIBUTING.md) - THE CRITICAL RULE and integration guidelines
