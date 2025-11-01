import { LexBrain } from '../src/index.js';

async function demo() {
  console.log('LexBrain SDK Demo');
  console.log('================');

  // Local mode example
  console.log('\n1. Local Mode Demo:');
  const localBrain = new LexBrain({
    url: 'http://localhost:8123',
    mode: 'local'
  });

  // Compute inputs hash
  const inputsHash = LexBrain.inputsHash({ source: 'demo_scan' });
  console.log(`Inputs hash: ${inputsHash}`);

  // Store a fact
  const putResult = await localBrain.put({
    kind: 'repo_scan',
    scope: { repo: 'demo', commit: 'deadbeef' },
    inputs_hash: inputsHash,
    payload: { hello: 'world', files: ['src/main.ts', 'package.json'] }
  });

  console.log(`Put result:`, putResult);

  // Query facts
  const facts = await localBrain.get({
    repo: 'demo',
    commit: 'deadbeef',
    kind: 'repo_scan'
  });

  console.log(`Retrieved ${facts.length} facts:`);
  facts.forEach(fact => {
    console.log(`- ${fact.fact_id}: ${JSON.stringify(fact.payload)}`);
  });

  // ZK mode example (if you have a key)
  const zkKey = process.env.LEXBRAIN_KEY_HEX;
  if (zkKey) {
    console.log('\n2. ZK Mode Demo:');
    const zkBrain = new LexBrain({
      url: 'http://localhost:8123',
      mode: 'zk',
      keyHex: zkKey
    });

    const zkPutResult = await zkBrain.put({
      kind: 'note',
      scope: { repo: 'demo', commit: 'deadbeef' },
      inputs_hash: LexBrain.inputsHash({ type: 'encrypted_note' }),
      payload: { secret: 'This is encrypted!', timestamp: Date.now() }
    });

    console.log(`ZK Put result:`, zkPutResult);

    const zkFacts = await zkBrain.get({
      repo: 'demo',
      commit: 'deadbeef',
      kind: 'note'
    });

    console.log(`Retrieved ${zkFacts.length} encrypted facts:`);
    zkFacts.forEach((fact: any) => {
      console.log(`- ${fact.fact_id}`);
      console.log(`  Encrypted payload:`, fact.payload);
      if (fact.decrypt) {
        const decrypted = fact.decrypt(fact.payload);
        console.log(`  Decrypted payload:`, decrypted);
      }
    });
  } else {
    console.log('\n2. ZK Mode Demo: Skipped (no LEXBRAIN_KEY_HEX set)');
  }

  // Lock demo
  console.log('\n3. Lock Demo:');
  const lockName = `demo-lock-${Date.now()}`;

  const acquired = await localBrain.lock(lockName);
  console.log(`Lock acquired: ${acquired}`);

  if (acquired) {
    // Try to acquire the same lock (should fail)
    const acquired2 = await localBrain.lock(lockName);
    console.log(`Second lock attempt: ${acquired2}`);

    // Release the lock
    await localBrain.unlock(lockName);
    console.log('Lock released');
  }

  console.log('\nDemo completed!');
}

demo().catch(console.error);
