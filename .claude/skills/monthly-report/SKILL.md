---
name: monthly-report
description: Generate a detailed end-of-month financial report with income, spending, category breakdown, top merchants, and month-over-month comparison. Use when the user asks for a monthly report, month summary, or "how did March go?"
---

Generate a detailed monthly financial report. If the user specifies a month (e.g., "March", "2026-02"), use that month. Otherwise default to the current month.

Call these MCP tools:

0. Call `search_learnings` (no args) to see the memory index. Check for budget targets, spending patterns, and transfer rules. Call `get_learning` for the specific IDs you need.
1. `get_balances` for current account balances
2. `get_transactions` with `start_date` and `end_date` covering the full month, `limit` set to 500
3. `get_spending_summary` with the same date range
4. `get_monthly_comparison` with `months` set to 3

## Transfer and Loan Payment Handling

Always call `get_accounts` first to know what accounts are connected.

**LOAN_PAYMENTS (always count as spending):**
All loan payments are real expenses: mortgage, credit card payments, auto loans, student loans, BNPL, personal loans. Never exclude them. When presenting the category breakdown, split LOAN_PAYMENTS into subcategories using `categoryDetailed`:
- Mortgage (LOAN_PAYMENTS_MORTGAGE_PAYMENT)
- Credit card payments (LOAN_PAYMENTS_CREDIT_CARD_PAYMENT)
- Auto loan (LOAN_PAYMENTS_AUTO_PAYMENT)
- Student loan (LOAN_PAYMENTS_STUDENT_LOAN_PAYMENT)
- BNPL / Personal loan / Other

Note: credit card payments show up on both sides (debit from checking, credit on the card). If both accounts are connected, the payment side (negative amount on the credit card) is just the ledger entry, the positive amount from checking is the real outflow. Only count the outflow (positive amount) as spending.

**TRANSFER_IN / TRANSFER_OUT (conditional):**
1. Check if the merchant/counterparty name matches a connected account or institution
2. If the matching account is connected: exclude it (money just moved between the user's own accounts)
3. If there is no matching connected account: count it as real spending or income
4. If unsure, note it separately as "Possible internal transfers" so the user can verify

From the results, present:

**Summary**
- Total Income (sum of negative-amount transactions excluding transfers, shown as positive)
- Total Spending (sum of positive-amount transactions excluding transfers)
- Net Savings (income minus spending)
- Savings Rate (net / income as percentage)
- Transfers Excluded (total dollar amount of transfers filtered out, so the user sees what was removed)

**Spending by Category**
Table with columns: Category, Amount, # Transactions, % of Total. Show all categories, sorted by amount descending. TRANSFER_IN and TRANSFER_OUT categories must not appear here.

**Top 10 Merchants**
Table showing the merchants where the most money was spent, with total amount and transaction count. Exclude any merchant that is actually a connected account/institution.

**Largest Transaction**
The single highest-amount non-transfer transaction with date, merchant, amount, and category.

**Month-over-Month**
Compare to the previous month: is spending up or down? Which categories changed the most? Is income stable?

Format as clean markdown. Use currency formatting ($X,XXX.XX). Do not show raw JSON.

**After presenting results:** If budget targets exist in learnings, compare actual spending to targets and flag over-budget categories. Only save new learnings for patterns that contradict or extend existing memories and are not derivable from a single tool call. Always update existing learnings (by ID) rather than creating duplicates.
