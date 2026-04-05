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
- `search_learnings` - Step 1: Search stored memories by description. Returns index (id, type, description, period, timestamps) without content. Agent reads descriptions + temporal info to decide what's relevant.
- `get_learning` - Step 2: Load full markdown content of a specific learning by ID. Call after search_learnings.
- `save_learning` - Store or update a financial memory. Always search first to avoid duplicates. Types: profile, budget, pattern, rule, fact, anomaly, recommendation, goal.
- `mark_learning_stale` - Archive a memory (excluded from default search, kept for history).
- `delete_learning` - Permanently remove a memory.

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

## Agent Memory / Learnings

The agent has a persistent memory system stored in the `learnings` table in SQLite. This is the primary way financial context persists across conversations. Any user who installs Fino and connects their accounts gets their own learning layer.

### Memory Types

| Type | What to store |
|------|--------------|
| `profile` | Income sources, net worth components, household info, employment details |
| `budget` | Monthly spending targets per category, the overall monthly target |
| `pattern` | Recurring spending patterns, merchant behavior, seasonal trends |
| `rule` | Spending rules and transfer handling rules (e.g., "Card X is a family member's card", "Account Y is external") |
| `fact` | Point-in-time financial facts (net worth snapshots, account balances, investment positions) |
| `anomaly` | Unusual transactions, spending spikes, unexpected charges |
| `recommendation` | Actionable advice (subscriptions to cancel, debts to pay off, investment moves) |
| `goal` | Financial targets with timelines (e.g., "target net worth by year X", "monthly spending target") |

### How the Agent Should Use Memory

Memory retrieval is always a two-step process:

**Step 1 — Search:** Call `search_learnings` to get the index. This returns descriptions, types, periods, and timestamps — but no content. Read the descriptions and temporal info to decide which memories are relevant to the current task.

**Step 2 — Load:** Call `get_learning(id: "...")` for each memory you need. Only load what's relevant. Don't load everything.

**At conversation start:** Call `search_learnings()` (no args) to see the full index. For a spending question, you might load the budget target and transfer rules. For a net worth question, load the profile and latest fact. You rarely need all of them.

**When saving:** Always call `search_learnings` first to check if a similar learning exists. If it does, pass its `id` to `save_learning` to update it. The tool will warn you about potential duplicates, but prevention is better than cleanup.

**When facts change:** Update the existing learning by passing its `id`. Don't create a new one alongside the old one. If a learning is no longer relevant at all, call `mark_learning_stale`.

**Description quality matters:** The description field is how the agent finds memories later. Write it like a search-optimized summary: "Monthly spending target is $X with $Y in fixed costs" is better than "Budget info". Multi-word searches match when ALL words appear in the description.

### What NOT to Save

- Raw transaction data (already in the database, query it fresh)
- Temporary conversation context
- Anything derivable from a single MCP tool call (e.g., "food was $1,800 this month")
- Monthly spending totals for individual months (just re-query them)
- Duplicates of existing learnings (search first, update instead)

### What TO Save

- Conclusions from multi-step analysis (like the 15-month spending analysis)
- User-stated facts the tools can't derive (salary is after-tax, equity expectations)
- Transfer classification rules (which accounts are internal, which Zelle recipients are family)
- Budget targets and financial goals
- Subscription audit results and cancel recommendations
- Patterns that only emerge from cross-month comparison (spending trending up, seasonal patterns)
- Anomalies that contradict existing learnings (a card payment suddenly tripled)

## Personal Data Rule (Critical)

NEVER commit personal financial data to the repository. This is an open-source project. All personal data (account names, balances, income amounts, merchant names, spending figures, employer names, family member names, specific dollar amounts from the user's life) must live ONLY in:
- `data/finance.db` (gitignored) - transactions, learnings, account data
- Claude Code memory (`~/.claude/`) - per-user, not in repo

Code, skills, tests, and documentation must use generic placeholder examples only (e.g., "salary $5K/mo", "Card X", "monthly target is $X"). If you discover personal data in a tracked file, remove it immediately before committing.

## Database Rules

NEVER delete or reset the database file (data/finance.db). It contains real connected bank accounts and synced transactions that cannot be recovered without manually re-connecting and re-syncing everything. When schema changes are needed, use ALTER TABLE statements or write migration SQL. If drizzle-kit push fails on an existing database, write manual migration statements instead of dropping the database.

## Project Structure

- `server/` - Hono API server (routes for Plaid, accounts, transactions, spending)
- `client/` - React + Vite dashboard (build with `npm run build`, served by Hono)
- `mcp/` - MCP server entry point (stdio transport)
- `server/db/schema.ts` - Drizzle ORM schema (institutions, items, accounts, transactions, sync_log)
- `data/finance.db` - SQLite database (gitignored)
