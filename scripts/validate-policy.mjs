#!/usr/bin/env node

/**
 * Validates a LexMap policy file against the schema
 * Usage: node scripts/validate-policy.mjs [path-to-policy-file]
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import Ajv from 'ajv';

const ajv = new Ajv({ strict: false });

// Default file paths
const schemaPath = resolve(process.cwd(), 'docs/schemas/policy.schema.json');
const defaultPolicyPath = resolve(process.cwd(), 'lexmap.policy.json');

// Get policy file from argument or use default
const policyPath = process.argv[2] ? resolve(process.cwd(), process.argv[2]) : defaultPolicyPath;

try {
  // Load schema
  const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'));
  
  // Load policy file
  const policy = JSON.parse(readFileSync(policyPath, 'utf-8'));
  
  // Compile and validate
  const validate = ajv.compile(schema);
  const valid = validate(policy);
  
  if (valid) {
    console.log(`✅ Policy file is valid: ${policyPath}`);
    
    // Additional checks
    const moduleCount = Object.keys(policy.modules || {}).length;
    console.log(`   Found ${moduleCount} modules`);
    
    // Verify all modules have coords
    let allHaveCoords = true;
    for (const [moduleId, module] of Object.entries(policy.modules || {})) {
      if (!module.coords || !Array.isArray(module.coords) || module.coords.length !== 2) {
        console.error(`   ⚠️  Module "${moduleId}" has invalid coords`);
        allHaveCoords = false;
      }
    }
    
    if (allHaveCoords) {
      console.log(`   All modules have valid coords`);
    }
    
    process.exit(0);
  } else {
    console.error(`❌ Policy file is invalid: ${policyPath}`);
    console.error('Validation errors:');
    validate.errors?.forEach(err => {
      console.error(`  - ${err.instancePath}: ${err.message}`);
    });
    process.exit(1);
  }
} catch (error) {
  console.error(`❌ Error validating policy file: ${error.message}`);
  if (error.code === 'ENOENT') {
    console.error(`   File not found: ${error.path}`);
  }
  process.exit(1);
}
