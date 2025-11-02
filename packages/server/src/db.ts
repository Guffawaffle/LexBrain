import Database from 'better-sqlite3';
import { ThoughtFact, Frame } from './types.js';

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
      CREATE TABLE IF NOT EXISTS frames (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        branch TEXT NOT NULL,
        jira TEXT,
        module_scope TEXT NOT NULL,
        summary_caption TEXT NOT NULL,
        reference_point TEXT NOT NULL,
        status_snapshot TEXT NOT NULL,
        keywords TEXT,
        atlas_frame_id TEXT
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

    // Create indexes for frames table
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_frames_timestamp
      ON frames(timestamp);
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_frames_branch
      ON frames(branch);
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_frames_jira
      ON frames(jira);
    `);

    // Create FTS5 virtual table for fuzzy search on reference_point
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS frames_fts USING fts5(
        id UNINDEXED,
        reference_point,
        summary_caption,
        keywords,
        content=frames,
        content_rowid=rowid
      );
    `);

    // Triggers to keep FTS table in sync
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS frames_ai AFTER INSERT ON frames BEGIN
        INSERT INTO frames_fts(rowid, id, reference_point, summary_caption, keywords)
        VALUES (new.rowid, new.id, new.reference_point, new.summary_caption, new.keywords);
      END;
    `);

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS frames_ad AFTER DELETE ON frames BEGIN
        INSERT INTO frames_fts(frames_fts, rowid, id, reference_point, summary_caption, keywords)
        VALUES('delete', old.rowid, old.id, old.reference_point, old.summary_caption, old.keywords);
      END;
    `);

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS frames_au AFTER UPDATE ON frames BEGIN
        INSERT INTO frames_fts(frames_fts, rowid, id, reference_point, summary_caption, keywords)
        VALUES('delete', old.rowid, old.id, old.reference_point, old.summary_caption, old.keywords);
        INSERT INTO frames_fts(rowid, id, reference_point, summary_caption, keywords)
        VALUES (new.rowid, new.id, new.reference_point, new.summary_caption, new.keywords);
      END;
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

  insertFrame(frame: Frame): boolean {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO frames (
        id, timestamp, branch, jira, module_scope, summary_caption,
        reference_point, status_snapshot, keywords, atlas_frame_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      frame.id,
      frame.timestamp,
      frame.branch,
      frame.jira || null,
      JSON.stringify(frame.module_scope),
      frame.summary_caption,
      frame.reference_point,
      JSON.stringify(frame.status_snapshot),
      frame.keywords ? JSON.stringify(frame.keywords) : null,
      frame.atlas_frame_id || null
    );

    return result.changes > 0;
  }

  getFrameById(id: string): Frame | null {
    const stmt = this.db.prepare(`
      SELECT * FROM frames WHERE id = ?
    `);
    const row = stmt.get(id) as any;
    
    if (!row) return null;

    return {
      id: row.id,
      timestamp: row.timestamp,
      branch: row.branch,
      jira: row.jira || undefined,
      module_scope: JSON.parse(row.module_scope),
      summary_caption: row.summary_caption,
      reference_point: row.reference_point,
      status_snapshot: JSON.parse(row.status_snapshot),
      keywords: row.keywords ? JSON.parse(row.keywords) : undefined,
      atlas_frame_id: row.atlas_frame_id || undefined
    };
  }

  searchFrames(query: {
    reference_point?: string;
    jira?: string;
    branch?: string;
    limit?: number;
  }): Frame[] {
    let sql = 'SELECT * FROM frames WHERE 1=1';
    const params: any[] = [];

    // Use FTS for fuzzy search on reference_point
    if (query.reference_point) {
      sql = `
        SELECT frames.* FROM frames
        INNER JOIN frames_fts ON frames.rowid = frames_fts.rowid
        WHERE frames_fts MATCH ?
      `;
      params.push(query.reference_point);
    } else {
      if (query.jira) {
        sql += ' AND jira = ?';
        params.push(query.jira);
      }

      if (query.branch) {
        sql += ' AND branch = ?';
        params.push(query.branch);
      }
    }

    sql += ' ORDER BY timestamp DESC';
    
    if (query.limit) {
      sql += ' LIMIT ?';
      params.push(query.limit);
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as any[];

    return rows.map(row => ({
      id: row.id,
      timestamp: row.timestamp,
      branch: row.branch,
      jira: row.jira || undefined,
      module_scope: JSON.parse(row.module_scope),
      summary_caption: row.summary_caption,
      reference_point: row.reference_point,
      status_snapshot: JSON.parse(row.status_snapshot),
      keywords: row.keywords ? JSON.parse(row.keywords) : undefined,
      atlas_frame_id: row.atlas_frame_id || undefined
    }));
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
