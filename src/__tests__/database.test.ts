import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryDatabase } from '../database.js';
import { unlinkSync, existsSync } from 'node:fs';

const TEST_DB = ':memory:';

describe('MemoryDatabase', () => {
  let db: MemoryDatabase;

  beforeEach(() => {
    db = new MemoryDatabase({ path: TEST_DB, walMode: false });
  });

  afterEach(() => {
    db.close();
  });

  describe('create', () => {
    it('should create a memory entry', () => {
      const entry = db.create({
        category: 'architecture',
        title: 'API uses REST',
        content: 'The backend API follows REST conventions with JSON responses.',
      });

      expect(entry.id).toBeDefined();
      expect(entry.category).toBe('architecture');
      expect(entry.title).toBe('API uses REST');
      expect(entry.content).toContain('REST conventions');
      expect(entry.tags).toEqual([]);
      expect(entry.filePaths).toEqual([]);
      expect(entry.importance).toBe(5);
      expect(entry.source).toBe('user');
      expect(entry.accessCount).toBe(0);
    });

    it('should create with tags and file paths', () => {
      const entry = db.create({
        category: 'pattern',
        title: 'Repository pattern',
        content: 'All data access goes through repository classes.',
        tags: ['backend', 'database'],
        filePaths: ['src/repositories/'],
        importance: 8,
      });

      expect(entry.tags).toEqual(['backend', 'database']);
      expect(entry.filePaths).toEqual(['src/repositories/']);
      expect(entry.importance).toBe(8);
    });

    it('should clamp importance to 1-10', () => {
      const low = db.create({ category: 'context', title: 'Low', content: 'Test', importance: -5 });
      const high = db.create({ category: 'context', title: 'High', content: 'Test', importance: 99 });

      expect(low.importance).toBe(1);
      expect(high.importance).toBe(10);
    });
  });

  describe('getById', () => {
    it('should retrieve a memory by ID', () => {
      const created = db.create({ category: 'decision', title: 'Use TypeScript', content: 'Chose TS for type safety.' });
      const found = db.getById(created.id);

      expect(found).not.toBeNull();
      expect(found!.title).toBe('Use TypeScript');
    });

    it('should not increment access count by default', () => {
      const created = db.create({ category: 'context', title: 'Test', content: 'Test' });
      db.getById(created.id);
      db.getById(created.id);
      const found = db.getById(created.id);

      expect(found!.accessCount).toBe(0);
    });

    it('should increment access count when incrementAccess=true', () => {
      const created = db.create({ category: 'context', title: 'Test', content: 'Test' });
      db.getById(created.id, true);
      db.getById(created.id, true);
      db.getById(created.id, true);
      const found = db.getById(created.id);

      expect(found!.accessCount).toBe(3);
    });

    it('should return null for non-existent ID', () => {
      expect(db.getById('non-existent')).toBeNull();
    });
  });

  describe('update', () => {
    it('should update memory fields', () => {
      const created = db.create({ category: 'bug', title: 'Old title', content: 'Old content' });
      const updated = db.update({ id: created.id, title: 'New title', content: 'New content', importance: 9 });

      expect(updated!.title).toBe('New title');
      expect(updated!.content).toBe('New content');
      expect(updated!.importance).toBe(9);
    });

    it('should return null for non-existent ID', () => {
      expect(db.update({ id: 'non-existent', title: 'X' })).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete a memory', () => {
      const created = db.create({ category: 'todo', title: 'Remove later', content: 'Temp' });
      expect(db.delete(created.id)).toBe(true);
      expect(db.getById(created.id)).toBeNull();
    });

    it('should return false for non-existent ID', () => {
      expect(db.delete('non-existent')).toBe(false);
    });
  });

  describe('query', () => {
    beforeEach(() => {
      db.create({ category: 'architecture', title: 'Microservices', content: 'System uses microservices architecture with Docker.', tags: ['docker', 'backend'], importance: 9 });
      db.create({ category: 'pattern', title: 'Singleton pattern', content: 'Database connection uses singleton pattern.', tags: ['backend', 'database'], importance: 7 });
      db.create({ category: 'convention', title: 'Naming convention', content: 'Use camelCase for variables, PascalCase for classes.', tags: ['style'], importance: 5 });
      db.create({ category: 'bug', title: 'Memory leak', content: 'Event listeners not cleaned up in useEffect.', tags: ['frontend', 'react'], filePaths: ['src/hooks/useData.ts'], importance: 8 });
    });

    it('should search by query (full-text)', () => {
      const results = db.query({ query: 'microservices' });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].title).toBe('Microservices');
    });

    it('should filter by category', () => {
      const results = db.query({ category: 'bug' });
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Memory leak');
    });

    it('should filter by minimum importance', () => {
      const results = db.query({ minImportance: 8 });
      expect(results.length).toBe(2);
      results.forEach(r => expect(r.importance).toBeGreaterThanOrEqual(8));
    });

    it('should filter by file path', () => {
      const results = db.query({ filePath: 'src/hooks' });
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Memory leak');
    });

    it('should filter by tags', () => {
      const results = db.query({ tags: ['backend'] });
      expect(results.length).toBe(2);
    });

    it('should respect limit', () => {
      const results = db.query({ limit: 2 });
      expect(results).toHaveLength(2);
    });

    it('should return all with no filters', () => {
      const results = db.query({});
      expect(results).toHaveLength(4);
    });
  });

  describe('getSummary', () => {
    it('should return project summary', () => {
      db.create({ category: 'architecture', title: 'T1', content: 'C1', tags: ['a', 'b'] });
      db.create({ category: 'architecture', title: 'T2', content: 'C2', tags: ['a'] });
      db.create({ category: 'bug', title: 'T3', content: 'C3', tags: ['b', 'c'] });

      const summary = db.getSummary();
      expect(summary.totalMemories).toBe(3);
      expect(summary.byCategory.architecture).toBe(2);
      expect(summary.byCategory.bug).toBe(1);
      expect(summary.topTags[0].tag).toBe('a');
      expect(summary.topTags[0].count).toBe(2);
    });

    it('should handle empty database', () => {
      const summary = db.getSummary();
      expect(summary.totalMemories).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle FTS query with special characters', () => {
      db.create({ category: 'context', title: 'Double quotes', content: 'This has "quoted" text inside.' });
      // Should not throw even with quotes in query
      const results = db.query({ query: '"quoted"' });
      expect(results).toBeDefined();
    });

    it('should handle FTS query with single word', () => {
      db.create({ category: 'architecture', title: 'REST API', content: 'Uses REST with express.' });
      const results = db.query({ query: 'REST' });
      expect(results.length).toBeGreaterThan(0);
    });

    it('should handle combined FTS query with category filter', () => {
      db.create({ category: 'architecture', title: 'REST API', content: 'REST endpoint design.' });
      db.create({ category: 'bug', title: 'REST bug', content: 'REST endpoint fails.' });
      const results = db.query({ query: 'REST', category: 'bug' });
      expect(results).toHaveLength(1);
      expect(results[0].category).toBe('bug');
    });

    it('should handle combined FTS query with minImportance filter', () => {
      db.create({ category: 'pattern', title: 'Singleton', content: 'Singleton pattern used.', importance: 3 });
      db.create({ category: 'pattern', title: 'Factory', content: 'Factory pattern used.', importance: 9 });
      const results = db.query({ query: 'pattern', minImportance: 8 });
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Factory');
    });

    it('should handle update with no changes', () => {
      const created = db.create({ category: 'context', title: 'No change', content: 'Same' });
      const updated = db.update({ id: created.id });
      expect(updated).not.toBeNull();
      expect(updated!.title).toBe('No change');
    });

    it('should update tags correctly', () => {
      const created = db.create({ category: 'context', title: 'Tagged', content: 'C', tags: ['old'] });
      const updated = db.update({ id: created.id, tags: ['new1', 'new2'] });
      expect(updated!.tags).toEqual(['new1', 'new2']);
    });

    it('should update filePaths correctly', () => {
      const created = db.create({ category: 'context', title: 'With paths', content: 'C', filePaths: ['src/old.ts'] });
      const updated = db.update({ id: created.id, filePaths: ['src/new.ts', 'lib/util.ts'] });
      expect(updated!.filePaths).toEqual(['src/new.ts', 'lib/util.ts']);
    });

    it('should clamp importance on update', () => {
      const created = db.create({ category: 'context', title: 'Clamp', content: 'C' });
      const updated = db.update({ id: created.id, importance: 999 });
      expect(updated!.importance).toBe(10);
    });

    it('should handle offset in query', () => {
      for (let i = 0; i < 5; i++) {
        db.create({ category: 'context', title: `Item ${i}`, content: `Content ${i}` });
      }
      const page1 = db.query({ limit: 2, offset: 0 });
      const page2 = db.query({ limit: 2, offset: 2 });
      expect(page1).toHaveLength(2);
      expect(page2).toHaveLength(2);
      expect(page1[0].id).not.toBe(page2[0].id);
    });

    it('should sort by importance', () => {
      db.create({ category: 'context', title: 'Low', content: 'C', importance: 2 });
      db.create({ category: 'context', title: 'High', content: 'C', importance: 9 });
      db.create({ category: 'context', title: 'Mid', content: 'C', importance: 5 });
      const results = db.query({ sortBy: 'importance' });
      expect(results[0].importance).toBeGreaterThanOrEqual(results[1].importance);
      expect(results[1].importance).toBeGreaterThanOrEqual(results[2].importance);
    });

    it('should enforce max limit of 100', () => {
      for (let i = 0; i < 5; i++) {
        db.create({ category: 'context', title: `Item ${i}`, content: `Content ${i}` });
      }
      const results = db.query({ limit: 999 });
      // Should not crash; max is 100 but we only have 5
      expect(results).toHaveLength(5);
    });
  });
});