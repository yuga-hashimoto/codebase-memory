import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import {
  MemoryEntry,
  CreateMemoryInput,
  UpdateMemoryInput,
  QueryOptions,
  ProjectSummary,
  DatabaseConfig,
  MemoryCategory,
} from './types.js';

const CATEGORIES: MemoryCategory[] = [
  'architecture', 'pattern', 'decision', 'dependency',
  'convention', 'bug', 'context', 'todo', 'relationship',
];

export class MemoryDatabase {
  private db: Database.Database;

  constructor(config: DatabaseConfig) {
    this.db = new Database(config.path);

    if (config.walMode !== false) {
      this.db.pragma('journal_mode = WAL');
    }
    this.db.pragma('foreign_keys = ON');

    this.initialize();
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        tags TEXT NOT NULL DEFAULT '[]',
        file_paths TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        access_count INTEGER NOT NULL DEFAULT 0,
        importance INTEGER NOT NULL DEFAULT 5,
        source TEXT NOT NULL DEFAULT 'user'
      );

      CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
      CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance DESC);
      CREATE INDEX IF NOT EXISTS idx_memories_updated ON memories(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_memories_accessed ON memories(access_count DESC);

      CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
        title, content, tags,
        content='memories',
        content_rowid='rowid'
      );

      CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
        INSERT INTO memories_fts(rowid, title, content, tags)
        VALUES (new.rowid, new.title, new.content, new.tags);
      END;

      CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, title, content, tags)
        VALUES ('delete', old.rowid, old.title, old.content, old.tags);
      END;

      CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, title, content, tags)
        VALUES ('delete', old.rowid, old.title, old.content, old.tags);
        INSERT INTO memories_fts(rowid, title, content, tags)
        VALUES (new.rowid, new.title, new.content, new.tags);
      END;
    `);
  }

  create(input: CreateMemoryInput): MemoryEntry {
    const id = randomUUID();
    const now = new Date().toISOString();
    const tags = JSON.stringify(input.tags ?? []);
    const filePaths = JSON.stringify(input.filePaths ?? []);
    const importance = Math.max(1, Math.min(10, input.importance ?? 5));

    this.db.prepare(`
      INSERT INTO memories (id, category, title, content, tags, file_paths, created_at, updated_at, importance, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'user')
    `).run(id, input.category, input.title, input.content, tags, filePaths, now, now, importance);

    return this.getById(id)!;
  }

  getById(id: string, incrementAccess = false): MemoryEntry | null {
    const row = this.db.prepare('SELECT * FROM memories WHERE id = ?').get(id) as any;
    if (!row) return null;

    if (incrementAccess) {
      this.db.prepare('UPDATE memories SET access_count = access_count + 1 WHERE id = ?').run(id);
    }

    return this.rowToEntry(row);
  }

  update(input: UpdateMemoryInput): MemoryEntry | null {
    const existing = this.db.prepare('SELECT * FROM memories WHERE id = ?').get(input.id) as any;
    if (!existing) return null;

    const updates: string[] = [];
    const values: any[] = [];

    if (input.title !== undefined) { updates.push('title = ?'); values.push(input.title); }
    if (input.content !== undefined) { updates.push('content = ?'); values.push(input.content); }
    if (input.category !== undefined) { updates.push('category = ?'); values.push(input.category); }
    if (input.tags !== undefined) { updates.push('tags = ?'); values.push(JSON.stringify(input.tags)); }
    if (input.filePaths !== undefined) { updates.push('file_paths = ?'); values.push(JSON.stringify(input.filePaths)); }
    if (input.importance !== undefined) { updates.push('importance = ?'); values.push(Math.max(1, Math.min(10, input.importance))); }

    if (updates.length === 0) return this.rowToEntry(existing);

    updates.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(input.id);

    this.db.prepare(`UPDATE memories SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    return this.getById(input.id);
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM memories WHERE id = ?').run(id);
    return result.changes > 0;
  }

  query(options: QueryOptions = {}): MemoryEntry[] {
    const limit = Math.min(options.limit ?? 20, 100);
    const offset = options.offset ?? 0;

    // Full-text search
    if (options.query) {
      const ftsQuery = options.query.split(/\s+/).map(w => `"${w.replace(/"/g, '""')}"`).join(' OR ');
      let sql = `
        SELECT m.*, rank
        FROM memories m
        JOIN memories_fts f ON m.rowid = f.rowid
        WHERE memories_fts MATCH ?
      `;
      const params: any[] = [ftsQuery];

      if (options.category) {
        sql += ' AND m.category = ?';
        params.push(options.category);
      }
      if (options.minImportance) {
        sql += ' AND m.importance >= ?';
        params.push(options.minImportance);
      }
      if (options.filePath) {
        sql += ' AND m.file_paths LIKE ?';
        params.push(`%${options.filePath}%`);
      }

      sql += ' ORDER BY rank';
      sql += ` LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      const rows = this.db.prepare(sql).all(...params) as any[];
      return rows.map(r => this.rowToEntry(r));
    }

    // Filtered query without FTS
    let sql = 'SELECT * FROM memories WHERE 1=1';
    const params: any[] = [];

    if (options.category) {
      sql += ' AND category = ?';
      params.push(options.category);
    }
    if (options.minImportance) {
      sql += ' AND importance >= ?';
      params.push(options.minImportance);
    }
    if (options.filePath) {
      sql += ' AND file_paths LIKE ?';
      params.push(`%${options.filePath}%`);
    }
    if (options.tags && options.tags.length > 0) {
      for (const tag of options.tags) {
        sql += ' AND tags LIKE ?';
        params.push(`%"${tag}"%`);
      }
    }

    const sortMap: Record<string, string> = {
      recent: 'updated_at DESC',
      importance: 'importance DESC',
      accessed: 'access_count DESC',
      relevance: 'updated_at DESC',
    };
    sql += ` ORDER BY ${sortMap[options.sortBy ?? 'recent']}`;
    sql += ` LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map(r => this.rowToEntry(r));
  }

  getSummary(): ProjectSummary {
    const totalMemories = (this.db.prepare('SELECT COUNT(*) as count FROM memories').get() as any).count;

    const byCategory: Record<string, number> = {};
    for (const cat of CATEGORIES) {
      const row = this.db.prepare('SELECT COUNT(*) as count FROM memories WHERE category = ?').get(cat) as any;
      byCategory[cat] = row.count;
    }

    // Parse all tags and count
    const allRows = this.db.prepare('SELECT tags FROM memories').all() as any[];
    const tagCounts: Record<string, number> = {};
    for (const row of allRows) {
      const tags = JSON.parse(row.tags) as string[];
      for (const tag of tags) {
        tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
      }
    }
    const topTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));

    const recentlyUpdated = this.query({ sortBy: 'recent', limit: 5 });
    const mostAccessed = this.query({ sortBy: 'accessed', limit: 5 });
    const highImportance = this.query({ minImportance: 8, sortBy: 'importance', limit: 5 });

    return {
      totalMemories,
      byCategory: byCategory as Record<MemoryCategory, number>,
      topTags,
      recentlyUpdated,
      mostAccessed,
      highImportance,
    };
  }

  close(): void {
    this.db.close();
  }

  private rowToEntry(row: any): MemoryEntry {
    return {
      id: row.id,
      category: row.category,
      title: row.title,
      content: row.content,
      tags: JSON.parse(row.tags),
      filePaths: JSON.parse(row.file_paths),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      accessCount: row.access_count,
      importance: row.importance,
      source: row.source,
    };
  }
}
