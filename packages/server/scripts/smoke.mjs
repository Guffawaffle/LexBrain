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
