import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';

export const institutions = sqliteTable('institutions', {
  id: text('id').primaryKey(),
  plaidInstitutionId: text('plaid_institution_id').unique(),
  name: text('name').notNull(),
  logoUrl: text('logo_url'),
  primaryColor: text('primary_color'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const items = sqliteTable('items', {
  id: text('id').primaryKey(),
  plaidItemId: text('plaid_item_id').unique().notNull(),
  institutionId: text('institution_id').references(() => institutions.id),
  accessTokenEncrypted: text('access_token_encrypted').notNull(),
  accessTokenIv: text('access_token_iv').notNull(),
  transactionCursor: text('transaction_cursor'),
  lastSyncedAt: integer('last_synced_at', { mode: 'timestamp' }),
  connectionStatus: text('connection_status', { enum: ['good', 'needs_reauth', 'error'] }).notNull().default('good'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  plaidAccountId: text('plaid_account_id').unique(),
  itemId: text('item_id').references(() => items.id),
  source: text('source', { enum: ['plaid', 'manual'] }).notNull().default('plaid'),
  name: text('name').notNull(),
  officialName: text('official_name'),
  type: text('type', { enum: ['depository', 'credit', 'investment', 'loan', 'other'] }).notNull(),
  subtype: text('subtype'),
  mask: text('mask'),
  currentBalance: real('current_balance'),
  availableBalance: real('available_balance'),
  creditLimit: real('credit_limit'),
  isoCurrencyCode: text('iso_currency_code').default('USD'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  index('accounts_item_id_idx').on(table.itemId),
]);

export const transactions = sqliteTable('transactions', {
  id: text('id').primaryKey(),
  plaidTransactionId: text('plaid_transaction_id').unique(),
  accountId: text('account_id').references(() => accounts.id).notNull(),
  source: text('source', { enum: ['plaid', 'import'] }).notNull().default('plaid'),
  importHash: text('import_hash'),
  amount: real('amount').notNull(),
  date: text('date').notNull(),
  authorizedDate: text('authorized_date'),
  name: text('name').notNull(),
  merchantName: text('merchant_name'),
  merchantLogoUrl: text('merchant_logo_url'),
  pending: integer('pending', { mode: 'boolean' }).notNull().default(false),
  paymentChannel: text('payment_channel', { enum: ['online', 'in store', 'other'] }),
  categoryPrimary: text('category_primary'),
  categoryDetailed: text('category_detailed'),
  categoryIcon: text('category_icon'),
  isoCurrencyCode: text('iso_currency_code').default('USD'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  index('transactions_date_account_idx').on(table.date, table.accountId),
  index('transactions_category_idx').on(table.categoryPrimary),
  index('transactions_merchant_idx').on(table.merchantName),
  index('transactions_import_hash_idx').on(table.importHash),
]);

// ─── Learnings / Memory ─────────────────────────────────────────────
// Single flexible table for all agent memory: spending rules, net worth facts,
// budget targets, patterns, anomalies, profile info, recommendations.
// Content is markdown. Description enables semantic search without loading full content.
export const learnings = sqliteTable('learnings', {
  id: text('id').primaryKey(),
  // Semantic type so agent can filter: profile, budget, pattern, rule, fact, anomaly, recommendation, goal
  memoryType: text('memory_type').notNull(),
  // Short searchable description (agent matches against this before loading full content)
  description: text('description').notNull(),
  // Full markdown content
  content: text('content').notNull(),
  // Optional: which period this relates to (e.g. "2026-03", "2025-Q4", "all-time")
  period: text('period'),
  // Stale memories are kept for history but excluded from active retrieval
  isStale: integer('is_stale', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  index('learnings_type_idx').on(table.memoryType),
  index('learnings_stale_idx').on(table.isStale),
  index('learnings_period_idx').on(table.period),
]);

export const syncLog = sqliteTable('sync_log', {
  id: text('id').primaryKey(),
  itemId: text('item_id').references(() => items.id).notNull(),
  addedCount: integer('added_count').notNull().default(0),
  modifiedCount: integer('modified_count').notNull().default(0),
  removedCount: integer('removed_count').notNull().default(0),
  syncedAt: integer('synced_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  status: text('status', { enum: ['success', 'error'] }).notNull(),
  errorMessage: text('error_message'),
});
