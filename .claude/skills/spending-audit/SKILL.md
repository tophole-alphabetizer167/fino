---
name: spending-audit
description: Audit the last 90 days of spending to find recurring charges, subscriptions, waste, unusual transactions, and spending trends. Use when the user asks "where is my money going?", wants to find subscriptions, or asks for a spending audit.
---

Perform a thorough spending audit over the last 90 days.

Call these MCP tools:

0. Call `search_learnings` (no args) to see the memory index. Check for existing patterns, rules, budget targets, and anomalies. Call `get_learning` for the specific IDs relevant to the audit. Compare new findings against existing learnings.
1. `get_transactions` with `start_date` set to 90 days ago, `end_date` set to today, `limit` set to 500
2. If total exceeds 500, make additional calls with `offset` to get all transactions
3. `get_spending_summary` with the same date range
4. `get_monthly_comparison` with `months` set to 3

## Transfer and Loan Payment Handling (Critical)

Always call `get_accounts` first to know what accounts are connected.

**LOAN_PAYMENTS (always count as spending):**
All loan payments are real expenses. Never exclude them. When analyzing spending, break LOAN_PAYMENTS into subcategories using `categoryDetailed`:
- Mortgage (LOAN_PAYMENTS_MORTGAGE_PAYMENT)
- Credit card payments (LOAN_PAYMENTS_CREDIT_CARD_PAYMENT)
- Auto loan (LOAN_PAYMENTS_AUTO_PAYMENT)
- Student loan (LOAN_PAYMENTS_STUDENT_LOAN_PAYMENT)
- BNPL / Personal loan / Other

Note: credit card payments show up on both sides (debit from checking, credit on the card). Only count the outflow (positive amount) as spending; the negative amount on the credit card is just the ledger entry.

**TRANSFER_IN / TRANSFER_OUT (conditional):**
1. Check if the merchant/counterparty name matches a connected account or institution
2. If the matching account is connected: exclude it (internal transfer)
3. If there is no matching connected account: count it as real spending or income
4. Keep a separate list of excluded internal transfers. Show them at the end so the user can verify nothing was miscategorized
5. All spending analysis below must exclude only verified internal transfers

Analyze the filtered transaction data and present:

**Recurring Charges (Likely Subscriptions)**
Find merchants that appear multiple times with similar amounts (within 10% variance). List them with: merchant name, typical amount, frequency (weekly/monthly), and estimated annual cost. Flag any that the user might not be aware of.

**Top Spending Categories**
Table of categories sorted by total amount, with percentage of total spending and average per month. TRANSFER_IN and TRANSFER_OUT must not appear here.

**Biggest Money Sinks**
Top 15 merchants by total spend, with total amount and number of transactions. Exclude merchants that are connected accounts/institutions.

**Trending Up**
Categories or merchants where spending has increased month over month. Compare the 3 months to spot trends.

**Unusual Transactions**
Flag any transactions that seem unusual: amounts significantly larger than the user's typical transaction size for that category, potential duplicate charges (same merchant, same amount, same day or consecutive days), or very round numbers that might be one-time fees.

**Potential Savings**
Based on the analysis, suggest specific areas where spending could be reduced, with estimated monthly savings.

**Transfers Excluded**
List the transfers that were filtered out: total amount, count, and the top transfer counterparties. This lets the user verify nothing real was accidentally excluded.

Format as clean markdown with tables. Use currency formatting.

**After presenting results:** Only save learnings for patterns that contradict or extend existing memories and are not derivable from a single tool call. Search existing learnings first, update by ID rather than creating duplicates. Mark stale any learnings that are no longer accurate.
