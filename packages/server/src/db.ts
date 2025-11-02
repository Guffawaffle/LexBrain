import Database from 'better-sqlite3';
import { ThoughtFact, Frame, AtlasFrame } from './types.js';

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

export interface FrameRow {
  id: string;
  timestamp: string;
  branch: string;
  jira: string | null;
  module_scope: string;
  summary_caption: string;
  reference_point: string;
  status_snapshot: string;
  keywords: string | null;
  atlas_frame_id: string | null;
}

export interface AtlasFrameRow {
  atlas_frame_id: string;
  frame_id: string;
  atlas_timestamp: string;
  reference_module: string;
  fold_radius: number;
  atlas_json: string;
  created_at: string;
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

    // Create atlas_frames table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS atlas_frames (
        atlas_frame_id TEXT PRIMARY KEY,
        frame_id TEXT NOT NULL,
        atlas_timestamp TEXT NOT NULL,
        reference_module TEXT NOT NULL,
        fold_radius INTEGER NOT NULL,
        atlas_json TEXT NOT NULL,
        created_at TEXT NOT NULL
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

    // Create indexes for atlas_frames table
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_atlas_frames_frame_id
      ON atlas_frames(frame_id);
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_atlas_frames_timestamp
      ON atlas_frames(atlas_timestamp);
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
    const row = stmt.get(id) as FrameRow | undefined;
    
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
    let sql: string;
    const params: any[] = [];
    const conditions: string[] = [];

    // Use FTS for fuzzy search on reference_point
    if (query.reference_point) {
      sql = `
        SELECT frames.* FROM frames
        INNER JOIN frames_fts ON frames.rowid = frames_fts.rowid
        WHERE frames_fts MATCH ?
      `;
      params.push(query.reference_point);

      // Add additional filters for jira and branch if provided
      if (query.jira) {
        conditions.push('frames.jira = ?');
        params.push(query.jira);
      }

      if (query.branch) {
        conditions.push('frames.branch = ?');
        params.push(query.branch);
      }

      if (conditions.length > 0) {
        sql += ' AND ' + conditions.join(' AND ');
      }
    } else {
      // Standard query without FTS
      sql = 'SELECT * FROM frames WHERE 1=1';

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
    const rows = stmt.all(...params) as FrameRow[];

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

  insertAtlasFrame(atlasFrame: AtlasFrame): boolean {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO atlas_frames (
        atlas_frame_id, frame_id, atlas_timestamp, reference_module,
        fold_radius, atlas_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      atlasFrame.atlas_frame_id,
      atlasFrame.frame_id,
      atlasFrame.atlas_timestamp,
      atlasFrame.reference_module,
      atlasFrame.fold_radius,
      JSON.stringify(atlasFrame),
      new Date().toISOString()
    );

    return result.changes > 0;
  }

  getAtlasFrameById(atlasFrameId: string): AtlasFrame | null {
    const stmt = this.db.prepare(`
      SELECT * FROM atlas_frames WHERE atlas_frame_id = ?
    `);
    const row = stmt.get(atlasFrameId) as AtlasFrameRow | undefined;
    
    if (!row) return null;

    try {
      return JSON.parse(row.atlas_json) as AtlasFrame;
    } catch (error) {
      console.error(`Failed to parse atlas_json for ${atlasFrameId}:`, error);
      return null;
    }
  }

  getAtlasFrameByFrameId(frameId: string): AtlasFrame | null {
    const stmt = this.db.prepare(`
      SELECT * FROM atlas_frames WHERE frame_id = ?
    `);
    const row = stmt.get(frameId) as AtlasFrameRow | undefined;
    
    if (!row) return null;

    try {
      return JSON.parse(row.atlas_json) as AtlasFrame;
    } catch (error) {
      console.error(`Failed to parse atlas_json for frame ${frameId}:`, error);
      return null;
    }
  }

  recallFrame(query: {
    reference_point?: string;
    jira?: string;
    frame_id?: string;
  }): { frame: Frame; atlas_frame: AtlasFrame | null } | null {
    let frame = null;

    // Priority: frame_id > reference_point > jira
    if (query.frame_id) {
      frame = this.getFrameById(query.frame_id);
    } else if (query.reference_point) {
      // Use FTS fuzzy search on reference_point
      const frames = this.searchFrames({
        reference_point: query.reference_point,
        limit: 1,
      });
      frame = frames.length > 0 ? frames[0] : null;
    } else if (query.jira) {
      // Search by JIRA ticket
      const frames = this.searchFrames({
        jira: query.jira,
        limit: 1,
      });
      frame = frames.length > 0 ? frames[0] : null;
    }

    if (!frame) {
      return null;
    }

    // Fetch linked Atlas Frame if exists
    let atlasFrame = null;
    if (frame.atlas_frame_id) {
      atlasFrame = this.getAtlasFrameById(frame.atlas_frame_id);
    }

    return {
      frame,
      atlas_frame: atlasFrame,
    };
  }
}
