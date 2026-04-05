# Fino

Local-first personal finance app. Connects to bank accounts via Plaid, stores transactions in SQLite, and provides an MCP server for financial analysis through Claude.

## MCP Tools

This project provides an MCP server (`mcp/index.ts`) with these tools:

- `sync_transactions` - Force sync with Plaid (all items or specific item_id)
- `get_accounts` - List accounts with balances (filter by account_type)
- `get_transactions` - Query transactions (filter by date range, account, category, amount range). Returns CSV by default, pass `format: "json"` for structured data
- `get_balances` - Net worth summary: cash, credit, investments, loans
- `get_spending_summary` - Spending by category with percentages for a date range. Includes ALL categories (TRANSFER_IN/TRANSFER_OUT shown as rows, not hidden)
- `get_monthly_comparison` - Income vs spending per month (default 3 months). Includes transfer breakdown per month so the intelligence layer can adjust
- `search_transactions` - Text search on merchant name. Returns CSV by default

All read tools auto-sync with Plaid if data is older than SYNC_THRESHOLD_HOURS (default 4).

## Financial Analysis Workflows

When asked about finances, compose the MCP tools as follows:

### Financial Snapshot
Call `get_balances` + `get_spending_summary` (current month: first day of month to today) + `get_monthly_comparison` (3 months). Present: net worth, cash vs credit balances, this month's total spending, top 3 spending categories, and whether spending is up or down vs last month.

### Monthly Report
For a given month, call `get_balances` + `get_transactions` (full month, limit 500) + `get_spending_summary` (that month) + `get_monthly_comparison` (3 months). Present: total income, total spending, net savings, full category breakdown as a table, top 10 merchants by spend, the single largest transaction, and comparison to the prior month.

### Spending Audit
Call `get_transactions` (last 90 days, limit 500) + `get_spending_summary` (last 90 days) + `get_monthly_comparison` (3 months). Analyze the raw transactions to identify: recurring charges (same merchant appearing multiple times with similar amounts), categories trending upward month over month, the merchants with the highest total spend, and any transactions that look unusual (very large, duplicate amounts on same day, etc).

### Cash Flow Analysis
Call `get_monthly_comparison` (6 months) + `get_balances`. Calculate: average monthly income, average monthly spending, average savings rate (net/income as percentage), identify months with negative net (spent more than earned), and project forward 3 months at the current average rate.

### Merchant Search
When searching for specific charges, call `search_transactions` with the query and also `get_transactions` filtered to the relevant date range. Sum up total spent at that merchant, count of transactions, and show the date range.

## Plaid Transaction Amounts

Plaid uses a specific sign convention: positive amounts are money going out (debits/spending), negative amounts are money coming in (credits/income). Keep this in mind when presenting data. Income shows as negative in the raw data.

## Transfer Handling (Critical Rule)

Credit card payments are real spending and should always be counted. For bank transfers (TRANSFER_IN/TRANSFER_OUT), only exclude them if you can verify the counterparty is another connected account:

1. Call `get_accounts` to get all connected accounts and institution names.
2. For each transfer transaction, check if the merchant/counterparty matches a connected account or institution.
3. If the matching account is connected: exclude it (money just moved between the user's own accounts, e.g., checking to savings at the same bank).
4. If there is no matching connected account: treat it as real spending or income (money left or entered the user's ecosystem).
5. The MCP tools return all data truthfully including transfers. `get_spending_summary` includes TRANSFER_IN and TRANSFER_OUT as categories in the breakdown. `get_monthly_comparison` includes transfers in the main totals and breaks out transfer amounts separately. The skills layer (the intelligence layer) decides which transfers are internal vs external by checking merchant names against connected institutions via `get_accounts`.

## Database Rules

NEVER delete or reset the database file (data/finance.db). It contains real connected bank accounts and synced transactions that cannot be recovered without manually re-connecting and re-syncing everything. When schema changes are needed, use ALTER TABLE statements or write migration SQL. If drizzle-kit push fails on an existing database, write manual migration statements instead of dropping the database.

## Project Structure

- `server/` - Hono API server (routes for Plaid, accounts, transactions, spending)
- `client/` - React + Vite dashboard (build with `npm run build`, served by Hono)
- `mcp/` - MCP server entry point (stdio transport)
- `server/db/schema.ts` - Drizzle ORM schema (institutions, items, accounts, transactions, sync_log)
- `data/finance.db` - SQLite database (gitignored)
