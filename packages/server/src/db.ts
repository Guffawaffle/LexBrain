import Database from 'better-sqlite3';
import { ThoughtFact } from './types.js';

export interface DbRow {
  fact_id: string;
  kind: string;
  repo: string;
  commit: string;
  path: string | null;
  symbol: string | null;
  inputs_hash: string;
  payload: string;
  ts: string;
  ttl_seconds: number | null;
  actor: string | null;
  refs: string | null;
}

export class DbManager {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.initialize();
  }

  private initialize() {
    // Set SQLite pragmas for performance
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('cache_size = 10000');

    // Create tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS facts (
        fact_id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        repo TEXT NOT NULL,
        "commit" TEXT NOT NULL,
        path TEXT,
        symbol TEXT,
        inputs_hash TEXT NOT NULL,
        payload TEXT NOT NULL,
        ts TEXT NOT NULL,
        ttl_seconds INTEGER,
        actor TEXT,
        refs TEXT
      );
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS locks (
        name TEXT PRIMARY KEY
      );
    `);

    // Create indexes for performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_facts_rc
      ON facts(repo, "commit", kind);
    `);    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_facts_path
      ON facts(repo, "commit", path);
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_facts_ttl
      ON facts(ts, ttl_seconds)
      WHERE ttl_seconds IS NOT NULL;
    `);
  }

  insertFact(fact: Omit<ThoughtFact, 'fact_id'> & { fact_id: string; payload_json: string }): boolean {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO facts (
        fact_id, kind, repo, "commit", path, symbol, inputs_hash,
        payload, ts, ttl_seconds, actor, refs
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      fact.fact_id,
      fact.kind,
      fact.scope.repo,
      fact.scope.commit,
      fact.scope.path || null,
      fact.scope.symbol || null,
      fact.inputs_hash,
      fact.payload_json,
      fact.ts,
      fact.ttl_seconds || null,
      fact.actor ? JSON.stringify(fact.actor) : null,
      fact.refs ? JSON.stringify(fact.refs) : null
    );

    return result.changes > 0;
  }

  getFacts(query: {
    repo: string;
    commit: string;
    kind: string;
    path?: string;
    symbol?: string;
    inputs_hash?: string;
  }): DbRow[] {
    let sql = `
      SELECT * FROM facts
      WHERE repo = ? AND "commit" = ? AND kind = ?
    `;
    const params: any[] = [query.repo, query.commit, query.kind];

    if (query.path !== undefined) {
      sql += ' AND path = ?';
      params.push(query.path);
    }

    if (query.symbol !== undefined) {
      sql += ' AND symbol = ?';
      params.push(query.symbol);
    }

    if (query.inputs_hash !== undefined) {
      sql += ' AND inputs_hash = ?';
      params.push(query.inputs_hash);
    }

    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as DbRow[];
  }

  acquireLock(name: string): boolean {
    const stmt = this.db.prepare('INSERT OR IGNORE INTO locks (name) VALUES (?)');
    const result = stmt.run(name);
    return result.changes > 0;
  }

  releaseLock(name: string): boolean {
    const stmt = this.db.prepare('DELETE FROM locks WHERE name = ?');
    const result = stmt.run(name);
    return result.changes > 0;
  }

  cleanupExpiredFacts(): number {
    const stmt = this.db.prepare(`
      DELETE FROM facts
      WHERE ttl_seconds IS NOT NULL
        AND datetime(ts, '+' || ttl_seconds || ' seconds') < datetime('now')
    `);
    const result = stmt.run();
    return result.changes;
  }

  close() {
    this.db.close();
  }

  getStats(): { totalFacts: number; totalLocks: number } {
    const factsCount = this.db.prepare('SELECT COUNT(*) as count FROM facts').get() as { count: number };
    const locksCount = this.db.prepare('SELECT COUNT(*) as count FROM locks').get() as { count: number };

    return {
      totalFacts: factsCount.count,
      totalLocks: locksCount.count
    };
  }
}
