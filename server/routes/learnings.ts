import { Hono } from 'hono';
import { db, schema } from '../db/index.js';
import { eq, desc } from 'drizzle-orm';

const learnings = new Hono();

learnings.get('/', async (c) => {
  const rows = await db.select({
    id: schema.learnings.id,
    memoryType: schema.learnings.memoryType,
    description: schema.learnings.description,
    content: schema.learnings.content,
    period: schema.learnings.period,
    isStale: schema.learnings.isStale,
    createdAt: schema.learnings.createdAt,
    updatedAt: schema.learnings.updatedAt,
  })
    .from(schema.learnings)
    .orderBy(desc(schema.learnings.updatedAt));

  return c.json(rows);
});

learnings.patch('/:id/stale', async (c) => {
  const id = c.req.param('id');
  const existing = await db.select().from(schema.learnings).where(eq(schema.learnings.id, id));
  if (existing.length === 0) return c.json({ error: 'Not found' }, 404);

  await db.update(schema.learnings)
    .set({ isStale: true, updatedAt: new Date() })
    .where(eq(schema.learnings.id, id));

  return c.json({ ok: true });
});

learnings.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const existing = await db.select().from(schema.learnings).where(eq(schema.learnings.id, id));
  if (existing.length === 0) return c.json({ error: 'Not found' }, 404);

  await db.delete(schema.learnings).where(eq(schema.learnings.id, id));
  return c.json({ ok: true });
});

export default learnings;
