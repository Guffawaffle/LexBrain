#!/usr/bin/env node

import { LexBrain } from '../../sdk-ts/dist/index.js';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';

let serverProcess;

async function startServer() {
  console.log('Starting server...');

  // Clean up any existing database
  try {
    await fs.unlink('./test-thoughts.db');
    await fs.unlink('./test-thoughts.db-wal');
    await fs.unlink('./test-thoughts.db-shm');
  } catch (e) {
    // Ignore if files don't exist
  }

  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      PORT: '8124',
      LEXBRAIN_DB: './test-thoughts.db',
      LEXBRAIN_MODE: 'local'
    };

    serverProcess = spawn('node', ['dist/server.js'], {
      env,
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';

    serverProcess.stdout.on('data', (data) => {
      output += data.toString();
      if (output.includes('LexBrain server starting on port 8124')) {
        // Give it a moment to fully initialize
        setTimeout(() => resolve(), 1000);
      }
    });

    serverProcess.stderr.on('data', (data) => {
      console.error('Server stderr:', data.toString());
    });

    serverProcess.on('error', (error) => {
      reject(error);
    });

    // Timeout after 10 seconds
    setTimeout(() => {
      reject(new Error('Server startup timeout'));
    }, 10000);
  });
}

function stopServer() {
  if (serverProcess) {
    console.log('Stopping server...');
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }
}

async function runTests() {
  console.log('Running smoke tests...');

  try {
    // Initialize client
    const brain = new LexBrain({
      url: 'http://localhost:8124',
      mode: 'local',
      timeoutMs: 5000
    });

    console.log('✓ Client initialized');

    // Test 1: Put a fact
    const inputsHash = LexBrain.inputsHash({ source: 'smoke_test' });
    const payload = {
      test: true,
      timestamp: Date.now(),
      files: ['test.js', 'package.json']
    };

    const putResult1 = await brain.put({
      kind: 'repo_scan',
      scope: { repo: 'smoke-test', commit: 'abc123' },
      inputs_hash: inputsHash,
      payload: payload
    });

    console.log('✓ First put successful:', putResult1);

    if (!putResult1.fact_id || putResult1.inserted !== true) {
      throw new Error('First put should return fact_id and inserted=true');
    }

    // Test 2: Put the same fact again (should not be inserted)
    const putResult2 = await brain.put({
      kind: 'repo_scan',
      scope: { repo: 'smoke-test', commit: 'abc123' },
      inputs_hash: inputsHash,
      payload: payload
    });

    console.log('✓ Second put successful:', putResult2);

    if (putResult2.fact_id !== putResult1.fact_id || putResult2.inserted !== false) {
      throw new Error('Second put should return same fact_id and inserted=false');
    }

    // Test 3: Get facts
    const facts = await brain.get({
      repo: 'smoke-test',
      commit: 'abc123',
      kind: 'repo_scan'
    });

    console.log('✓ Get successful:', facts.length, 'facts');

    if (facts.length !== 1) {
      throw new Error('Should retrieve exactly 1 fact');
    }

    if (facts[0].fact_id !== putResult1.fact_id) {
      throw new Error('Retrieved fact should have same fact_id');
    }

    // Test 4: Get with exact inputs_hash (cache hit)
    const exactFacts = await brain.get({
      repo: 'smoke-test',
      commit: 'abc123',
      kind: 'repo_scan',
      inputs_hash: inputsHash
    });

    console.log('✓ Exact get successful:', exactFacts.length, 'facts');

    if (exactFacts.length !== 1) {
      throw new Error('Exact query should retrieve exactly 1 fact');
    }

    // Test 5: Lock tests
    const lockName = `smoke-test-lock-${Date.now()}`;

    const lock1 = await brain.lock(lockName);
    console.log('✓ First lock acquired:', lock1);

    if (!lock1) {
      throw new Error('First lock should be acquired successfully');
    }

    const lock2 = await brain.lock(lockName);
    console.log('✓ Second lock attempt:', lock2);

    if (lock2) {
      throw new Error('Second lock on same name should fail');
    }

    await brain.unlock(lockName);
    console.log('✓ Lock released');

    // Test 6: Lock after unlock should work
    const lock3 = await brain.lock(lockName);
    console.log('✓ Lock after unlock:', lock3);

    if (!lock3) {
      throw new Error('Lock should be acquirable after unlock');
    }

    await brain.unlock(lockName);
    console.log('✓ Second unlock');

    // --- MCP over HTTP tests ---
    console.log('\nRunning MCP-over-HTTP smoke...');

    // List tools
    const listResp = await fetch('http://localhost:8124/mcp/tools/list');
    if (!listResp.ok) throw new Error('MCP tools/list failed');
    const list = await listResp.json();
    const toolNames = (list.tools || []).map(t => t.name);
    console.log('✓ MCP tools listed:', toolNames.join(', '));
    if (!toolNames.includes('thought.put') || !toolNames.includes('thought.get')) {
      throw new Error('MCP tools list missing required tools');
    }

    // Call thought.put via MCP
    const ih2 = LexBrain.inputsHash({ source: 'smoke_test_mcp' });
    const mcpPutResp = await fetch('http://localhost:8124/mcp/tools/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'thought.put',
        arguments: {
          kind: 'repo_scan',
          scope: { repo: 'smoke-test', commit: 'abc123' },
          inputs_hash: ih2,
          payload: { via: 'mcp', n: 1 }
        }
      })
    });
    if (!mcpPutResp.ok) throw new Error('MCP thought.put failed');
    const mcpPut = await mcpPutResp.json();
    console.log('✓ MCP put:', mcpPut);
    if (!mcpPut.fact_id) throw new Error('MCP put missing fact_id');

    // Call thought.get via MCP
    const mcpGetResp = await fetch('http://localhost:8124/mcp/tools/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'thought.get',
        arguments: {
          repo: 'smoke-test',
          commit: 'abc123',
          kind: 'repo_scan',
          inputs_hash: ih2
        }
      })
    });
    if (!mcpGetResp.ok) throw new Error('MCP thought.get failed');
    const mcpGet = await mcpGetResp.json();
    console.log('✓ MCP get count:', Array.isArray(mcpGet.content) ? mcpGet.content.length : -1);
    if (!Array.isArray(mcpGet.content) || mcpGet.content.length !== 1) {
      throw new Error('MCP get should return exactly 1 fact');
    }

    // Lock via MCP
    const mcpLockResp = await fetch('http://localhost:8124/mcp/tools/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'thought.lock', arguments: { name: lockName + '-mcp' } })
    });
    if (!mcpLockResp.ok) throw new Error('MCP thought.lock failed');
    const mcpLock = await mcpLockResp.json();
    console.log('✓ MCP lock:', mcpLock);
    if (!mcpLock.ok) throw new Error('MCP lock should be ok');

    const mcpUnlockResp = await fetch('http://localhost:8124/mcp/tools/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'thought.unlock', arguments: { name: lockName + '-mcp' } })
    });
    if (!mcpUnlockResp.ok) throw new Error('MCP thought.unlock failed');
    const mcpUnlock = await mcpUnlockResp.json();
    console.log('✓ MCP unlock:', mcpUnlock);
    if (!mcpUnlock.ok) throw new Error('MCP unlock should be ok');

    // --- Atlas Frame tests ---
    console.log('\nRunning Atlas Frame smoke...');

    // Test 1: Store an Atlas Frame
    const atlasFrameId = 'atlas_test_' + Date.now();
    const frameId = 'frame_test_' + Date.now();
    const atlasFrameData = {
      atlas_frame_id: atlasFrameId,
      frame_id: frameId,
      atlas_timestamp: new Date().toISOString(),
      reference_module: 'ui/user-admin-panel',
      fold_radius: 1,
      modules: [
        {
          id: 'ui/user-admin-panel',
          coordinates: { x: 2, y: 5 },
          layer: 'presentation'
        },
        {
          id: 'services/user-access-api',
          coordinates: { x: 5, y: 5 },
          layer: 'application'
        }
      ],
      edges: [
        {
          from: 'ui/user-admin-panel',
          to: 'services/user-access-api',
          allowed: true,
          rule: 'ui-must-use-service-layer'
        }
      ],
      critical_rule: 'THE CRITICAL RULE: module_scope must use canonical module IDs from LexMap'
    };

    const putAtlasResp = await fetch('http://localhost:8124/mcp/tools/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'thought.put_atlas_frame',
        arguments: atlasFrameData
      })
    });
    if (!putAtlasResp.ok) throw new Error('MCP thought.put_atlas_frame failed');
    const putAtlas = await putAtlasResp.json();
    console.log('✓ MCP put_atlas_frame:', putAtlas);
    if (!putAtlas.atlas_frame_id || putAtlas.inserted !== true) {
      throw new Error('put_atlas_frame should return atlas_frame_id and inserted=true');
    }

    // Test 2: Get Atlas Frame by ID
    const getAtlasByIdResp = await fetch('http://localhost:8124/mcp/tools/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'thought.get_atlas_frame',
        arguments: { atlas_frame_id: atlasFrameId }
      })
    });
    if (!getAtlasByIdResp.ok) throw new Error('MCP thought.get_atlas_frame by ID failed');
    const getAtlasById = await getAtlasByIdResp.json();
    console.log('✓ MCP get_atlas_frame by ID:', getAtlasById.content ? 'found' : 'not found');
    if (!getAtlasById.content) {
      throw new Error('get_atlas_frame by ID should return the Atlas Frame');
    }

    // Test 3: Get Atlas Frame by frame_id
    const getAtlasByFrameResp = await fetch('http://localhost:8124/mcp/tools/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'thought.get_atlas_frame',
        arguments: { frame_id: frameId }
      })
    });
    if (!getAtlasByFrameResp.ok) throw new Error('MCP thought.get_atlas_frame by frame_id failed');
    const getAtlasByFrame = await getAtlasByFrameResp.json();
    console.log('✓ MCP get_atlas_frame by frame_id:', getAtlasByFrame.content ? 'found' : 'not found');
    if (!getAtlasByFrame.content) {
      throw new Error('get_atlas_frame by frame_id should return the Atlas Frame');
    }

    // Test 4: Get cached Atlas Frame by reference_module and fold_radius
    const getCachedResp = await fetch('http://localhost:8124/mcp/tools/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'thought.get_atlas_frame',
        arguments: { reference_module: 'ui/user-admin-panel', fold_radius: 1 }
      })
    });
    if (!getCachedResp.ok) throw new Error('MCP thought.get_atlas_frame cached failed');
    const getCached = await getCachedResp.json();
    console.log('✓ MCP get_atlas_frame cached:', getCached.content ? 'cache hit' : 'cache miss');
    if (!getCached.content) {
      throw new Error('get_atlas_frame cached should return the Atlas Frame (cache hit)');
    }

    console.log('\n🎉 All smoke tests passed!');

  } catch (error) {
    console.error('\n❌ Smoke test failed:', error.message);
    process.exit(1);
  }
}

async function main() {
  try {
    await startServer();
    await runTests();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    stopServer();
  }
}

// Handle cleanup on exit
process.on('SIGINT', () => {
  stopServer();
  process.exit(0);
});

process.on('SIGTERM', () => {
  stopServer();
  process.exit(0);
});

main();
