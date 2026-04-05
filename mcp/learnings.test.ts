import { describe, it, expect, beforeEach } from 'vitest';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { eq, and, desc, like, sql } from 'drizzle-orm';
import * as schema from '../server/db/schema.js';

// ─── Test database setup ────────────────────────────────────────────
// Each test gets a fresh in-memory SQLite database. Never touches finance.db.

function createTestDb() {
  const client = createClient({ url: ':memory:' });
  const db = drizzle(client, { schema });

  // Create the learnings table manually (drizzle-kit push doesn't work on in-memory)
  client.executeMultiple(`
    CREATE TABLE learnings (
      id TEXT PRIMARY KEY,
      memory_type TEXT NOT NULL,
      description TEXT NOT NULL,
      content TEXT NOT NULL,
      period TEXT,
      is_stale INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX learnings_type_idx ON learnings(memory_type);
    CREATE INDEX learnings_stale_idx ON learnings(is_stale);
    CREATE INDEX learnings_period_idx ON learnings(period);
  `);

  return { db, client };
}

// ─── Helper: replicate the MCP tool logic for testing ───────────────
// These mirror the actual tool implementations in mcp/index.ts

async function saveLearning(
  db: ReturnType<typeof drizzle>,
  args: {
    id?: string;
    memory_type: string;
    description: string;
    content: string;
    period?: string;
  }
) {
  const now = new Date();
  const { id, memory_type, description, content, period } = args;

  if (id) {
    const existing = await db.select().from(schema.learnings).where(eq(schema.learnings.id, id));
    if (existing.length === 0) return { error: `No learning found with id "${id}"` };
    await db.update(schema.learnings)
      .set({ memoryType: memory_type, description, content, period, updatedAt: now, isStale: false })
      .where(eq(schema.learnings.id, id));
    return { updated: id };
  }

  // Check for duplicates (same memory_type)
  const dupeCheck = await db.select({
    id: schema.learnings.id,
    memoryType: schema.learnings.memoryType,
    description: schema.learnings.description,
  })
    .from(schema.learnings)
    .where(and(
      eq(schema.learnings.memoryType, memory_type as any),
      eq(schema.learnings.isStale, false),
    ))
    .orderBy(desc(schema.learnings.updatedAt))
    .limit(5);

  const learningId = id || `learn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await db.insert(schema.learnings).values({
    id: learningId,
    memoryType: memory_type,
    description,
    content,
    period,
    isStale: false,
    createdAt: now,
    updatedAt: now,
  });

  return { created: learningId, duplicateWarnings: dupeCheck };
}

async function searchLearnings(
  db: ReturnType<typeof drizzle>,
  args: {
    query?: string;
    memory_type?: string;
    include_stale?: boolean;
    limit?: number;
  } = {}
) {
  const { query, memory_type, include_stale = false, limit = 25 } = args;
  const conditions = [];
  if (!include_stale) conditions.push(eq(schema.learnings.isStale, false));
  if (memory_type) conditions.push(eq(schema.learnings.memoryType, memory_type as any));
  if (query) {
    const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 0);
    for (const word of words) {
      conditions.push(sql`lower(${schema.learnings.description}) LIKE ${'%' + word + '%'}`);
    }
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  return db.select({
    id: schema.learnings.id,
    memoryType: schema.learnings.memoryType,
    description: schema.learnings.description,
    period: schema.learnings.period,
    isStale: schema.learnings.isStale,
    createdAt: schema.learnings.createdAt,
    updatedAt: schema.learnings.updatedAt,
  })
    .from(schema.learnings)
    .where(where)
    .orderBy(desc(schema.learnings.updatedAt))
    .limit(limit);
}

async function getLearning(db: ReturnType<typeof drizzle>, id: string) {
  const rows = await db.select().from(schema.learnings).where(eq(schema.learnings.id, id));
  return rows[0] || null;
}

async function markStale(db: ReturnType<typeof drizzle>, id: string) {
  const existing = await db.select().from(schema.learnings).where(eq(schema.learnings.id, id));
  if (existing.length === 0) return { error: 'not found' };
  await db.update(schema.learnings)
    .set({ isStale: true, updatedAt: new Date() })
    .where(eq(schema.learnings.id, id));
  return { staled: id };
}

async function deleteLearning(db: ReturnType<typeof drizzle>, id: string) {
  const existing = await db.select().from(schema.learnings).where(eq(schema.learnings.id, id));
  if (existing.length === 0) return { error: 'not found' };
  await db.delete(schema.learnings).where(eq(schema.learnings.id, id));
  return { deleted: id };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('learnings', () => {
  let db: ReturnType<typeof drizzle>;
  let client: ReturnType<typeof createClient>;

  beforeEach(() => {
    const testDb = createTestDb();
    db = testDb.db;
    client = testDb.client;
  });

  describe('save_learning', () => {
    it('creates a new learning with generated ID', async () => {
      const result = await saveLearning(db, {
        memory_type: 'budget',
        description: 'Monthly target is $4,000',
        content: '## Budget\n\nTarget: $4,000/month',
        period: 'all-time',
      });

      expect(result.created).toBeDefined();
      expect(result.created).toMatch(/^learn_/);

      const saved = await getLearning(db, result.created!);
      expect(saved).not.toBeNull();
      expect(saved!.memoryType).toBe('budget');
      expect(saved!.description).toBe('Monthly target is $4,000');
      expect(saved!.content).toBe('## Budget\n\nTarget: $4,000/month');
      expect(saved!.period).toBe('all-time');
      expect(saved!.isStale).toBe(false);
    });

    it('updates an existing learning by ID', async () => {
      const { created } = await saveLearning(db, {
        memory_type: 'fact',
        description: 'Net worth is $500K',
        content: 'Old content',
      });

      await saveLearning(db, {
        id: created!,
        memory_type: 'fact',
        description: 'Net worth is $619K',
        content: 'Updated content',
        period: '2026-04',
      });

      const updated = await getLearning(db, created!);
      expect(updated!.description).toBe('Net worth is $619K');
      expect(updated!.content).toBe('Updated content');
      expect(updated!.period).toBe('2026-04');
    });

    it('returns error when updating non-existent ID', async () => {
      const result = await saveLearning(db, {
        id: 'does_not_exist',
        memory_type: 'fact',
        description: 'test',
        content: 'test',
      });

      expect(result.error).toContain('No learning found');
    });

    it('un-stales a learning when updated', async () => {
      const { created } = await saveLearning(db, {
        memory_type: 'pattern',
        description: 'Some pattern',
        content: 'Content',
      });

      await markStale(db, created!);
      let learning = await getLearning(db, created!);
      expect(learning!.isStale).toBe(true);

      await saveLearning(db, {
        id: created!,
        memory_type: 'pattern',
        description: 'Updated pattern',
        content: 'New content',
      });

      learning = await getLearning(db, created!);
      expect(learning!.isStale).toBe(false);
    });

    it('warns about potential duplicates on create', async () => {
      await saveLearning(db, {
        memory_type: 'budget',
        description: 'Monthly target is $4,000',
        content: 'First version',
      });

      const result = await saveLearning(db, {
        memory_type: 'budget',
        description: 'Monthly spending budget $4K',
        content: 'Second version',
      });

      expect(result.created).toBeDefined();
      expect(result.duplicateWarnings).toHaveLength(1);
      expect(result.duplicateWarnings![0].description).toBe('Monthly target is $4,000');
    });

    it('does not warn about duplicates of different memory_type', async () => {
      await saveLearning(db, {
        memory_type: 'fact',
        description: 'Net worth is $200K',
        content: 'Fact content',
      });

      const result = await saveLearning(db, {
        memory_type: 'budget',
        description: 'Budget is $4K',
        content: 'Budget content',
      });

      expect(result.duplicateWarnings).toHaveLength(0);
    });

    it('does not warn about stale duplicates', async () => {
      const { created } = await saveLearning(db, {
        memory_type: 'budget',
        description: 'Old budget',
        content: 'Old',
      });
      await markStale(db, created!);

      const result = await saveLearning(db, {
        memory_type: 'budget',
        description: 'New budget',
        content: 'New',
      });

      expect(result.duplicateWarnings).toHaveLength(0);
    });
  });

  describe('search_learnings', () => {
    beforeEach(async () => {
      // Seed test data
      const items = [
        { id: 'profile_income', type: 'profile', desc: 'Income sources: salary $5K/mo after tax, freelance $3K/mo', period: 'all-time' },
        { id: 'budget_target', type: 'budget', desc: 'Monthly spending target is $4,000 with $2,500 in fixed costs', period: 'all-time' },
        { id: 'pattern_food', type: 'pattern', desc: 'Food spending averages $800/mo, delivery apps add 2-3x markup', period: '2026-Q1' },
        { id: 'rule_transfers', type: 'rule', desc: 'Internal bank transfers are excluded, brokerage is investment', period: 'all-time' },
        { id: 'stale_old', type: 'fact', desc: 'Net worth was $100K in December 2025', period: '2025-12' },
      ];

      for (const item of items) {
        await saveLearning(db, {
          memory_type: item.type,
          description: item.desc,
          content: `Content for ${item.id}`,
          period: item.period,
        });
        // Mark the last one stale
        if (item.id === 'stale_old') {
          // Find the actual ID (generated)
          const rows = await db.select().from(schema.learnings).where(like(schema.learnings.description, '%$100K%'));
          if (rows[0]) await markStale(db, rows[0].id);
        }
      }
    });

    it('returns all active learnings when no args', async () => {
      const results = await searchLearnings(db);
      expect(results.length).toBe(4); // 5 total minus 1 stale
    });

    it('excludes stale by default', async () => {
      const results = await searchLearnings(db);
      const descriptions = results.map(r => r.description);
      expect(descriptions).not.toContain(expect.stringContaining('$100K'));
    });

    it('includes stale when requested', async () => {
      const results = await searchLearnings(db, { include_stale: true });
      expect(results.length).toBe(5);
    });

    it('filters by memory_type', async () => {
      const results = await searchLearnings(db, { memory_type: 'budget' });
      expect(results.length).toBe(1);
      expect(results[0].description).toContain('$4,000');
    });

    it('searches by single word query', async () => {
      const results = await searchLearnings(db, { query: 'salary' });
      expect(results.length).toBe(1);
      expect(results[0].description).toContain('salary');
    });

    it('searches by multi-word query (all words must match)', async () => {
      const results = await searchLearnings(db, { query: 'spending target' });
      expect(results.length).toBe(1);
      expect(results[0].description).toContain('$4,000');
    });

    it('multi-word query fails when not all words present', async () => {
      const results = await searchLearnings(db, { query: 'spending cryptocurrency' });
      expect(results.length).toBe(0);
    });

    it('search is case-insensitive', async () => {
      const results = await searchLearnings(db, { query: 'SALARY' });
      expect(results.length).toBe(1);
    });

    it('respects limit', async () => {
      const results = await searchLearnings(db, { limit: 2 });
      expect(results.length).toBe(2);
    });

    it('returns descriptions but not content', async () => {
      const results = await searchLearnings(db);
      for (const r of results) {
        expect(r).toHaveProperty('id');
        expect(r).toHaveProperty('description');
        expect(r).toHaveProperty('memoryType');
        expect(r).toHaveProperty('period');
        expect(r).toHaveProperty('createdAt');
        expect(r).toHaveProperty('updatedAt');
        expect(r).not.toHaveProperty('content');
      }
    });

    it('combines type filter and query', async () => {
      const results = await searchLearnings(db, { memory_type: 'pattern', query: 'food' });
      expect(results.length).toBe(1);
      expect(results[0].description).toContain('delivery');
    });

    it('returns empty array for no matches', async () => {
      const results = await searchLearnings(db, { query: 'nonexistent_term_xyz' });
      expect(results.length).toBe(0);
    });
  });

  describe('get_learning', () => {
    it('returns full content by ID', async () => {
      const { created } = await saveLearning(db, {
        memory_type: 'fact',
        description: 'Test fact',
        content: '## Full markdown content\n\nWith **bold** and details.',
      });

      const learning = await getLearning(db, created!);
      expect(learning).not.toBeNull();
      expect(learning!.content).toBe('## Full markdown content\n\nWith **bold** and details.');
      expect(learning!.description).toBe('Test fact');
      expect(learning!.memoryType).toBe('fact');
    });

    it('returns null for non-existent ID', async () => {
      const learning = await getLearning(db, 'does_not_exist');
      expect(learning).toBeNull();
    });
  });

  describe('mark_learning_stale', () => {
    it('marks a learning as stale', async () => {
      const { created } = await saveLearning(db, {
        memory_type: 'fact',
        description: 'Will become stale',
        content: 'Content',
      });

      const result = await markStale(db, created!);
      expect(result.staled).toBe(created);

      const learning = await getLearning(db, created!);
      expect(learning!.isStale).toBe(true);
    });

    it('stale learnings excluded from default search', async () => {
      const { created } = await saveLearning(db, {
        memory_type: 'fact',
        description: 'Unique stale description xyz',
        content: 'Content',
      });
      await markStale(db, created!);

      const results = await searchLearnings(db, { query: 'xyz' });
      expect(results.length).toBe(0);
    });

    it('returns error for non-existent ID', async () => {
      const result = await markStale(db, 'nope');
      expect(result.error).toBe('not found');
    });
  });

  describe('delete_learning', () => {
    it('permanently removes a learning', async () => {
      const { created } = await saveLearning(db, {
        memory_type: 'fact',
        description: 'To be deleted',
        content: 'Content',
      });

      await deleteLearning(db, created!);
      const learning = await getLearning(db, created!);
      expect(learning).toBeNull();
    });

    it('returns error for non-existent ID', async () => {
      const result = await deleteLearning(db, 'nope');
      expect(result.error).toBe('not found');
    });
  });

  describe('two-step retrieval flow', () => {
    it('search then get: agent workflow', async () => {
      // Save several learnings
      await saveLearning(db, {
        memory_type: 'budget',
        description: 'Monthly spending target is $4,000',
        content: '## Budget\n\n| Category | Amount |\n|---|---|\n| Rent | $1,500 |',
      });
      await saveLearning(db, {
        memory_type: 'profile',
        description: 'Income: salary $5K after tax, freelance $3K gross',
        content: '## Income\n\nSalary covers lifestyle, freelance funds investments.',
      });
      await saveLearning(db, {
        memory_type: 'pattern',
        description: 'Subscription bloat at $200/mo, target $80',
        content: '## Subscriptions\n\nCancel unused streaming services...',
      });

      // Step 1: Agent searches — gets index only
      const index = await searchLearnings(db, { query: 'spending' });
      expect(index.length).toBe(1);
      expect(index[0].description).toContain('$4,000');
      // Verify no content leaked into index
      expect((index[0] as any).content).toBeUndefined();

      // Step 2: Agent loads specific learning by ID
      const full = await getLearning(db, index[0].id);
      expect(full).not.toBeNull();
      expect(full!.content).toContain('Rent');
      expect(full!.content).toContain('$1,500');
    });
  });

  describe('timestamp handling', () => {
    it('stores and retrieves timestamps as Date objects', async () => {
      const before = new Date();
      const { created } = await saveLearning(db, {
        memory_type: 'fact',
        description: 'Timestamp test',
        content: 'Content',
      });
      const after = new Date();

      const learning = await getLearning(db, created!);
      expect(learning!.createdAt).toBeInstanceOf(Date);
      expect(learning!.updatedAt).toBeInstanceOf(Date);

      // Timestamps should be between before and after (within a second tolerance)
      const createdTime = learning!.createdAt!.getTime();
      expect(createdTime).toBeGreaterThanOrEqual(before.getTime() - 1000);
      expect(createdTime).toBeLessThanOrEqual(after.getTime() + 1000);
    });

    it('update changes updatedAt but not createdAt', async () => {
      const { created } = await saveLearning(db, {
        memory_type: 'fact',
        description: 'Original',
        content: 'V1',
      });

      const original = await getLearning(db, created!);
      const originalCreated = original!.createdAt!.getTime();

      // Small delay to ensure timestamp difference
      await new Promise(r => setTimeout(r, 50));

      await saveLearning(db, {
        id: created!,
        memory_type: 'fact',
        description: 'Updated',
        content: 'V2',
      });

      const updated = await getLearning(db, created!);
      expect(updated!.createdAt!.getTime()).toBe(originalCreated);
      expect(updated!.updatedAt!.getTime()).toBeGreaterThanOrEqual(originalCreated);
    });
  });

  describe('edge cases', () => {
    it('handles markdown with special characters in content', async () => {
      const content = '## Net Worth\n\n| Asset | Value |\n|---|---|\n| Cash | $270,000 |\n\n> "Quote with **bold**"\n\n```json\n{"key": "value"}\n```';
      const { created } = await saveLearning(db, {
        memory_type: 'fact',
        description: 'Complex markdown',
        content,
      });

      const learning = await getLearning(db, created!);
      expect(learning!.content).toBe(content);
    });

    it('handles empty period', async () => {
      const { created } = await saveLearning(db, {
        memory_type: 'fact',
        description: 'No period',
        content: 'Content',
      });

      const learning = await getLearning(db, created!);
      expect(learning!.period).toBeNull();
    });

    it('search with empty string query returns all', async () => {
      await saveLearning(db, { memory_type: 'fact', description: 'A', content: 'A' });
      await saveLearning(db, { memory_type: 'fact', description: 'B', content: 'B' });

      const results = await searchLearnings(db, { query: '' });
      expect(results.length).toBe(2);
    });

    it('handles many learnings within limit', async () => {
      for (let i = 0; i < 30; i++) {
        await saveLearning(db, {
          memory_type: 'fact',
          description: `Learning number ${i}`,
          content: `Content ${i}`,
        });
      }

      const defaultResults = await searchLearnings(db);
      expect(defaultResults.length).toBe(25); // default limit

      const allResults = await searchLearnings(db, { limit: 50 });
      expect(allResults.length).toBe(30);
    });
  });
});
