import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Load .env from project root (not cwd) so it works when spawned by Claude Code
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '..', '.env') });

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { eq, and, gte, lte, like, gt, desc, sql, asc } from 'drizzle-orm';
import { db, schema } from '../server/db/index.js';
import { syncTransactions } from '../server/lib/sync.js';

// How old data can be before we auto-sync (in hours)
const SYNC_THRESHOLD_HOURS = parseInt(process.env.SYNC_THRESHOLD_HOURS || '4');

// Track whether we already synced this session to avoid hammering Plaid
let syncedThisSession = false;
// Deduplicate concurrent sync calls (when multiple tools fire in parallel)
let activeSyncPromise: Promise<string | null> | null = null;

/**
 * Check if any connected item has stale data and sync if needed.
 * Deduplicates concurrent calls so parallel tool invocations don't triple-sync.
 */
async function ensureFreshData(): Promise<string | null> {
  if (activeSyncPromise) return activeSyncPromise;
  activeSyncPromise = _ensureFreshData();
  try {
    return await activeSyncPromise;
  } finally {
    activeSyncPromise = null;
  }
}

async function _ensureFreshData(): Promise<string | null> {
  if (syncedThisSession) return 'Data already synced this session.';

  const items = await db.select({
    id: schema.items.id,
    lastSyncedAt: schema.items.lastSyncedAt,
    connectionStatus: schema.items.connectionStatus,
    institutionName: schema.institutions.name,
  })
    .from(schema.items)
    .leftJoin(schema.institutions, eq(schema.items.institutionId, schema.institutions.id));

  if (items.length === 0) return null;

  const now = Date.now();
  const thresholdMs = SYNC_THRESHOLD_HOURS * 60 * 60 * 1000;
  const staleItems = items.filter((item) => {
    if (item.connectionStatus !== 'good') return false;
    if (!item.lastSyncedAt) return true;
    const lastSync = new Date(item.lastSyncedAt).getTime();
    return (now - lastSync) > thresholdMs;
  });

  if (staleItems.length === 0) {
    // Find the most recent sync time for status
    const mostRecent = items
      .filter((i) => i.lastSyncedAt)
      .sort((a, b) => new Date(b.lastSyncedAt!).getTime() - new Date(a.lastSyncedAt!).getTime())[0];
    if (mostRecent?.lastSyncedAt) {
      const ago = formatTimeAgo(new Date(mostRecent.lastSyncedAt));
      return `Data is fresh (last synced ${ago}).`;
    }
    return null;
  }

  // Sync stale items
  const results = [];
  for (const item of staleItems) {
    try {
      const result = await syncTransactions(item.id);
      const name = item.institutionName || item.id;
      results.push(`${name}: +${result.added} added, ${result.modified} modified, ${result.removed} removed`);
    } catch (err) {
      const name = item.institutionName || item.id;
      results.push(`${name}: sync failed (${String(err)})`);
    }
  }

  syncedThisSession = true;
  return `Auto-synced ${staleItems.length} stale item(s):\n${results.join('\n')}`;
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Wraps a tool handler to ensure fresh data before querying.
 * Prepends sync status to the response so Claude knows data freshness.
 */
function withFreshData<T>(handler: (args: T) => Promise<{ content: Array<{ type: 'text'; text: string }> }>) {
  return async (args: T) => {
    let syncStatus: string | null = null;
    try {
      syncStatus = await ensureFreshData();
    } catch (err) {
      syncStatus = `Warning: auto-sync failed (${String(err)}). Returning cached data.`;
    }

    const result = await handler(args);

    // Prepend sync status to the first text content
    if (syncStatus && result.content.length > 0) {
      const first = result.content[0];
      result.content[0] = {
        type: 'text' as const,
        text: `[Sync: ${syncStatus}]\n\n${first.text}`,
      };
    }

    return result;
  };
}

// ─── Utilities ──────────────────────────────────────────────────────

function toCSV(rows: Record<string, unknown>[], columns: { key: string; header: string; maxLen?: number }[]): string {
  const header = columns.map(c => c.header).join(',');
  const lines = rows.map(row =>
    columns.map(c => {
      const val = row[c.key];
      if (val === null || val === undefined) return '';
      let str = String(val);
      if (c.maxLen && str.length > c.maxLen) str = str.slice(0, c.maxLen) + '...';
      if (str.includes(',') || str.includes('\n') || str.includes('"')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    }).join(',')
  );
  return [header, ...lines].join('\n');
}

const txnColumns = [
  { key: 'date', header: 'date' },
  { key: 'amount', header: 'amount' },
  { key: 'name', header: 'name', maxLen: 50 },
  { key: 'merchantName', header: 'merchant' },
  { key: 'categoryPrimary', header: 'category' },
  { key: 'pending', header: 'pending' },
  { key: 'accountName', header: 'account' },
  { key: 'accountType', header: 'acctType' },
];

const searchColumns = [
  { key: 'date', header: 'date' },
  { key: 'amount', header: 'amount' },
  { key: 'name', header: 'name', maxLen: 50 },
  { key: 'merchantName', header: 'merchant' },
  { key: 'categoryPrimary', header: 'category' },
  { key: 'accountName', header: 'account' },
];

function buildAutoSummary(rows: Record<string, unknown>[], total: number): string {
  const byCat: Record<string, { spending: number; count: number }> = {};
  let totalSpending = 0;
  for (const row of rows) {
    const amount = row.amount as number;
    if (amount > 0) {
      const cat = (row.categoryPrimary as string) || 'UNCATEGORIZED';
      if (!byCat[cat]) byCat[cat] = { spending: 0, count: 0 };
      byCat[cat].spending += amount;
      byCat[cat].count += 1;
      totalSpending += amount;
    }
  }
  const sorted = Object.entries(byCat)
    .sort((a, b) => b[1].spending - a[1].spending)
    .slice(0, 8);
  const lines = [
    `${rows.length} transactions shown (${total} total matching)`,
    `Total spending in result set: $${totalSpending.toFixed(2)}`,
    '',
    'Top categories:',
    ...sorted.map(([cat, d]) =>
      `  ${cat}: $${d.spending.toFixed(2)} (${d.count} txns, ${((d.spending / totalSpending) * 100).toFixed(1)}%)`
    ),
  ];
  return lines.join('\n');
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Server ──────────────────────────────────────────────────────────

const server = new McpServer({
  name: 'fino',
  version: '1.0.0',
});

// ─── Manual sync tool ────────────────────────────────────────────────

server.tool('sync_transactions', 'Force sync all connected bank accounts with Plaid to get latest transactions and balances', {
  item_id: z.string().optional().describe('Sync a specific item by ID. If omitted, syncs all items.'),
}, async ({ item_id }) => {
  const items = item_id
    ? await db.select({ id: schema.items.id, institutionName: schema.institutions.name })
        .from(schema.items)
        .leftJoin(schema.institutions, eq(schema.items.institutionId, schema.institutions.id))
        .where(eq(schema.items.id, item_id))
    : await db.select({ id: schema.items.id, institutionName: schema.institutions.name })
        .from(schema.items)
        .leftJoin(schema.institutions, eq(schema.items.institutionId, schema.institutions.id));

  if (items.length === 0) {
    return { content: [{ type: 'text' as const, text: 'No connected items found. Connect a bank account through the web dashboard first.' }] };
  }

  const results = [];
  for (const item of items) {
    try {
      const result = await syncTransactions(item.id);
      results.push({
        item: item.institutionName || item.id,
        status: 'success',
        added: result.added,
        modified: result.modified,
        removed: result.removed,
      });
    } catch (err) {
      results.push({
        item: item.institutionName || item.id,
        status: 'error',
        error: String(err),
      });
    }
  }

  syncedThisSession = true;
  return { content: [{ type: 'text' as const, text: JSON.stringify(results) }] };
});

// ─── Read tools (all auto-sync if stale) ────────────────────────────

server.tool('get_accounts', 'Get all connected bank accounts with balances', {
  account_type: z.enum(['depository', 'credit', 'investment', 'loan', 'other']).optional()
    .describe('Filter by account type'),
}, withFreshData(async ({ account_type }) => {
  const conditions = [];
  if (account_type) conditions.push(eq(schema.accounts.type, account_type));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db.select({
    id: schema.accounts.id,
    name: schema.accounts.name,
    type: schema.accounts.type,
    subtype: schema.accounts.subtype,
    mask: schema.accounts.mask,
    currentBalance: schema.accounts.currentBalance,
    availableBalance: schema.accounts.availableBalance,
    creditLimit: schema.accounts.creditLimit,
    institutionName: schema.institutions.name,
  })
    .from(schema.accounts)
    .leftJoin(schema.items, eq(schema.accounts.itemId, schema.items.id))
    .leftJoin(schema.institutions, eq(schema.items.institutionId, schema.institutions.id))
    .where(where);

  return { content: [{ type: 'text' as const, text: JSON.stringify(rows) }] };
}));

server.tool('get_transactions', 'Get financial transactions with optional filters. Returns CSV by default for compact output. Auto-syncs with Plaid if data is stale.', {
  start_date: z.string().optional().describe('Start date (YYYY-MM-DD)'),
  end_date: z.string().optional().describe('End date (YYYY-MM-DD)'),
  account_id: z.string().optional().describe('Filter by account ID'),
  category: z.string().optional().describe('Filter by primary category (e.g. FOOD_AND_DRINK, TRANSPORTATION, SHOPPING, etc.)'),
  min_amount: z.number().optional().describe('Minimum amount'),
  max_amount: z.number().optional().describe('Maximum amount'),
  limit: z.number().optional().default(50).describe('Max results (default 50)'),
  offset: z.number().optional().default(0).describe('Offset for pagination'),
  format: z.enum(['csv', 'json']).optional().default('csv').describe('Output format: csv (compact, default) or json'),
}, withFreshData(async ({ start_date, end_date, account_id, category, min_amount, max_amount, limit, offset, format }) => {
  const conditions = [];
  if (start_date) conditions.push(gte(schema.transactions.date, start_date));
  if (end_date) conditions.push(lte(schema.transactions.date, end_date));
  if (account_id) conditions.push(eq(schema.transactions.accountId, account_id));
  if (category) conditions.push(eq(schema.transactions.categoryPrimary, category));
  if (min_amount !== undefined) conditions.push(gte(schema.transactions.amount, min_amount));
  if (max_amount !== undefined) conditions.push(lte(schema.transactions.amount, max_amount));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db.select({
    date: schema.transactions.date,
    amount: schema.transactions.amount,
    name: schema.transactions.name,
    merchantName: schema.transactions.merchantName,
    categoryPrimary: schema.transactions.categoryPrimary,
    categoryDetailed: schema.transactions.categoryDetailed,
    pending: schema.transactions.pending,
    accountName: schema.accounts.name,
    accountType: schema.accounts.type,
  })
    .from(schema.transactions)
    .leftJoin(schema.accounts, eq(schema.transactions.accountId, schema.accounts.id))
    .where(where)
    .orderBy(desc(schema.transactions.date))
    .limit(limit)
    .offset(offset);

  const [total] = await db.select({ count: sql<number>`count(*)` })
    .from(schema.transactions)
    .where(where);

  const count = total?.count || 0;

  if (format === 'csv') {
    const header = rows.length >= 100
      ? buildAutoSummary(rows as Record<string, unknown>[], count)
      : `${rows.length} transactions (${count} total matching)`;
    const csv = toCSV(rows as Record<string, unknown>[], txnColumns);
    return {
      content: [{
        type: 'text' as const,
        text: `${header}\n\n${csv}`,
      }],
    };
  } else {
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({ transactions: rows, total: count }),
      }],
    };
  }
}));

server.tool('search_transactions', 'Search transactions by merchant name or description. Returns CSV by default. Auto-syncs with Plaid if data is stale.', {
  query: z.string().describe('Search query (matches against merchant name)'),
  limit: z.number().optional().default(20).describe('Max results'),
  format: z.enum(['csv', 'json']).optional().default('csv').describe('Output format: csv (compact, default) or json'),
}, withFreshData(async ({ query, limit, format }) => {
  const rows = await db.select({
    date: schema.transactions.date,
    amount: schema.transactions.amount,
    name: schema.transactions.name,
    merchantName: schema.transactions.merchantName,
    categoryPrimary: schema.transactions.categoryPrimary,
    accountName: schema.accounts.name,
  })
    .from(schema.transactions)
    .leftJoin(schema.accounts, eq(schema.transactions.accountId, schema.accounts.id))
    .where(like(schema.transactions.merchantName, `%${query}%`))
    .orderBy(desc(schema.transactions.date))
    .limit(limit);

  if (format === 'csv') {
    const csv = toCSV(rows as Record<string, unknown>[], searchColumns);
    return { content: [{ type: 'text' as const, text: `${rows.length} results for "${query}"\n\n${csv}` }] };
  } else {
    return { content: [{ type: 'text' as const, text: JSON.stringify(rows) }] };
  }
}));

server.tool('get_spending_summary', 'Spending breakdown by category for a date range. Returns ALL categories including TRANSFER_IN/TRANSFER_OUT truthfully so the intelligence layer can decide which transfers are internal vs external. Also returns top merchants (excluding transfers) and grand totals. Auto-syncs with Plaid if data is stale.', {
  start_date: z.string().describe('Start date (YYYY-MM-DD)'),
  end_date: z.string().describe('End date (YYYY-MM-DD)'),
  account_id: z.string().optional().describe('Filter by account ID'),
}, withFreshData(async ({ start_date, end_date, account_id }) => {
  const baseConds = [
    gte(schema.transactions.date, start_date),
    lte(schema.transactions.date, end_date),
  ];
  if (account_id) baseConds.push(eq(schema.transactions.accountId, account_id));

  // Query 1: Category breakdown (all categories, transfers included as rows)
  const categories = await db.select({
    category: schema.transactions.categoryPrimary,
    spending: sql<number>`sum(case when ${schema.transactions.amount} > 0 then ${schema.transactions.amount} else 0 end)`.as('spending'),
    income: sql<number>`sum(case when ${schema.transactions.amount} < 0 then abs(${schema.transactions.amount}) else 0 end)`.as('income'),
    count: sql<number>`count(*)`.as('count'),
  })
    .from(schema.transactions)
    .where(and(...baseConds))
    .groupBy(schema.transactions.categoryPrimary)
    .orderBy(desc(sql`spending`));

  // Query 2: Top 10 merchants by spend (excluding transfers so you see real merchants)
  const merchantConds = [
    ...baseConds,
    gt(schema.transactions.amount, 0),
    sql`${schema.transactions.categoryPrimary} NOT IN ('TRANSFER_IN', 'TRANSFER_OUT')`,
  ];
  const topMerchants = await db.select({
    merchant: sql<string>`coalesce(${schema.transactions.merchantName}, ${schema.transactions.name})`.as('merchant'),
    total: sql<number>`sum(${schema.transactions.amount})`.as('total'),
    count: sql<number>`count(*)`.as('count'),
  })
    .from(schema.transactions)
    .where(and(...merchantConds))
    .groupBy(sql`coalesce(${schema.transactions.merchantName}, ${schema.transactions.name})`)
    .orderBy(desc(sql`total`))
    .limit(10);

  // Query 3: Grand totals (everything included)
  const [totals] = await db.select({
    totalSpending: sql<number>`sum(case when ${schema.transactions.amount} > 0 then ${schema.transactions.amount} else 0 end)`.as('total_spending'),
    totalIncome: sql<number>`sum(case when ${schema.transactions.amount} < 0 then abs(${schema.transactions.amount}) else 0 end)`.as('total_income'),
    totalCount: sql<number>`count(*)`.as('total_count'),
  })
    .from(schema.transactions)
    .where(and(...baseConds));

  const grandSpending = totals?.totalSpending || 0;

  const result = {
    period: { start: start_date, end: end_date },
    totalSpending: round2(grandSpending),
    totalIncome: round2(totals?.totalIncome || 0),
    totalTransactions: totals?.totalCount || 0,
    categories: categories.map(c => ({
      category: c.category,
      spending: round2(c.spending || 0),
      income: round2(c.income || 0),
      count: c.count,
      pct: grandSpending > 0 ? round2(((c.spending || 0) / grandSpending) * 100) : 0,
    })),
    topMerchants: topMerchants.map(m => ({
      merchant: m.merchant,
      total: round2(m.total || 0),
      count: m.count,
    })),
  };

  return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
}));

server.tool('get_balances', 'Get current balances across all accounts with net worth calculation. Auto-syncs with Plaid if data is stale.', {},
  withFreshData(async () => {
  const rows = await db.select({
    name: schema.accounts.name,
    type: schema.accounts.type,
    subtype: schema.accounts.subtype,
    currentBalance: schema.accounts.currentBalance,
    availableBalance: schema.accounts.availableBalance,
    creditLimit: schema.accounts.creditLimit,
    institutionName: schema.institutions.name,
  })
    .from(schema.accounts)
    .leftJoin(schema.items, eq(schema.accounts.itemId, schema.items.id))
    .leftJoin(schema.institutions, eq(schema.items.institutionId, schema.institutions.id));

  let totalCash = 0, totalCredit = 0, totalInvestment = 0, totalLoan = 0;
  for (const acct of rows) {
    const balance = acct.currentBalance || 0;
    if (acct.type === 'depository') totalCash += balance;
    else if (acct.type === 'credit') totalCredit += balance;
    else if (acct.type === 'investment') totalInvestment += balance;
    else if (acct.type === 'loan') totalLoan += balance;
  }

  const result = {
    accounts: rows,
    summary: {
      totalCash: Math.round(totalCash * 100) / 100,
      totalCreditUsed: Math.round(totalCredit * 100) / 100,
      totalInvestment: Math.round(totalInvestment * 100) / 100,
      totalLoan: Math.round(totalLoan * 100) / 100,
      netWorth: Math.round((totalCash + totalInvestment - totalCredit - totalLoan) * 100) / 100,
    },
  };

  return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
}));

server.tool('get_monthly_comparison', 'Compare income vs spending month over month. Returns raw totals including all categories. Transfer amounts are broken out separately so the intelligence layer can determine which are internal vs external. Auto-syncs with Plaid if data is stale.', {
  months: z.number().optional().default(3).describe('Number of months to compare (default 3)'),
}, withFreshData(async ({ months }) => {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1)
    .toISOString().split('T')[0];

  const dateFilter = gte(schema.transactions.date, startDate);

  // Main totals (everything included - truthful)
  const rows = await db.select({
    month: sql<string>`strftime('%Y-%m', ${schema.transactions.date})`.as('month'),
    totalSpending: sql<number>`sum(case when ${schema.transactions.amount} > 0 then ${schema.transactions.amount} else 0 end)`.as('total_spending'),
    totalIncome: sql<number>`sum(case when ${schema.transactions.amount} < 0 then abs(${schema.transactions.amount}) else 0 end)`.as('total_income'),
  })
    .from(schema.transactions)
    .where(dateFilter)
    .groupBy(sql`strftime('%Y-%m', ${schema.transactions.date})`)
    .orderBy(sql`month`);

  // Transfer breakdown per month (so the model can adjust)
  const transferRows = await db.select({
    month: sql<string>`strftime('%Y-%m', ${schema.transactions.date})`.as('month'),
    transferIn: sql<number>`sum(case when ${schema.transactions.categoryPrimary} = 'TRANSFER_IN' and ${schema.transactions.amount} < 0 then abs(${schema.transactions.amount}) else 0 end)`.as('transfer_in'),
    transferOut: sql<number>`sum(case when ${schema.transactions.categoryPrimary} = 'TRANSFER_OUT' and ${schema.transactions.amount} > 0 then ${schema.transactions.amount} else 0 end)`.as('transfer_out'),
  })
    .from(schema.transactions)
    .where(dateFilter)
    .groupBy(sql`strftime('%Y-%m', ${schema.transactions.date})`)
    .orderBy(sql`month`);

  const transferMap = new Map(transferRows.map(t => [t.month, t]));

  const result = rows.map((r) => {
    const t = transferMap.get(r.month);
    return {
      month: r.month,
      spending: round2(r.totalSpending || 0),
      income: round2(r.totalIncome || 0),
      net: round2((r.totalIncome || 0) - (r.totalSpending || 0)),
      transfers: {
        in: round2(t?.transferIn || 0),
        out: round2(t?.transferOut || 0),
      },
    };
  });

  return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
}));

// ─── Start ──────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
