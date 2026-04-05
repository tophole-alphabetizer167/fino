---
name: snapshot
description: Quick financial health check showing balances, net worth, current month spending vs last month, and top spending categories. Use when the user asks for a financial overview, snapshot, or "how am I doing?"
---

Run a quick financial health check by calling these MCP tools:

0. Call `search_learnings` (no args) to see the memory index. If budget targets or spending patterns exist, call `get_learning` to load the relevant ones.
1. Call `get_balances` to get current account balances and net worth
2. Call `get_spending_summary` with `start_date` set to the first day of the current month and `end_date` set to today
3. Call `get_monthly_comparison` with `months` set to 3

After presenting results, if the data contradicts or extends existing learnings, call `save_learning` with the existing learning's ID to update it. Only save new learnings for patterns that are missing from memory and not derivable from a single tool call.

## Transfer and Loan Payment Handling

Always call `get_accounts` first to know what accounts are connected.

**LOAN_PAYMENTS (always count as spending):**
All loan payments are real expenses: mortgage, credit card payments, auto loans, student loans, BNPL, personal loans. Never exclude them. When presenting spending breakdowns, show LOAN_PAYMENTS broken into subcategories using `categoryDetailed`:
- Mortgage (LOAN_PAYMENTS_MORTGAGE_PAYMENT)
- Credit card payments (LOAN_PAYMENTS_CREDIT_CARD_PAYMENT)
- Auto loan (LOAN_PAYMENTS_AUTO_PAYMENT)
- Student loan (LOAN_PAYMENTS_STUDENT_LOAN_PAYMENT)
- BNPL / Personal loan / Other

Note: credit card payments show up on both sides (debit from checking, credit on the card). If both accounts are connected, the payment side (negative amount on the credit card) is just the ledger entry, the positive amount from checking is the real outflow. Present the outflow (positive amount) as the spending.

**TRANSFER_IN / TRANSFER_OUT (conditional):**
1. Check if the merchant/counterparty name matches a connected account or institution (e.g., "Bank of America", "Mercury", "Fidelity")
2. If the matching account is connected: exclude it (money just moved between the user's own accounts)
3. If there is no matching connected account: count it as real spending or income

Present the results as a concise briefing:

- **Net Worth**: total from get_balances summary
- **Cash**: total cash in depository accounts
- **Credit Used**: total credit card balances
- **Investments**: total investment account value
- **This Month's Spending**: total from spending summary, with the top 3 categories and their percentages
- **Trend**: compare this month's spending to last month from the monthly comparison. State whether spending is up or down and by how much (dollar amount and percentage)

Keep the output compact. Use a table for the category breakdown. Do not show raw JSON.
