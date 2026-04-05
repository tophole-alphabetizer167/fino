---
name: cash-flow
description: Analyze income vs expenses over 6 months, calculate savings rate, identify negative months, and project future balances. Use when the user asks about cash flow, savings rate, burn rate, or "am I saving money?"
---

Analyze cash flow trends over the last 6 months and project forward.

Call these MCP tools:

1. `get_monthly_comparison` with `months` set to 6
2. `get_balances` for current account balances

## Transfer and Loan Payment Handling

Always call `get_accounts` first to know what accounts are connected.

**LOAN_PAYMENTS (always count as spending):**
Loan payments (mortgage, credit card, auto, student, BNPL) are real expenses and should always be counted in spending. Credit card payments show on both sides; only count the outflow (positive amount) as spending.

**TRANSFER_IN / TRANSFER_OUT (the model decides):**
The `get_monthly_comparison` tool returns raw totals INCLUDING transfers, plus a separate `transfers` field showing `in` and `out` amounts per month. Use this to adjust the numbers:
1. Check the `transfers` field to see how much is TRANSFER_IN and TRANSFER_OUT each month
2. Call `get_accounts` to get connected institutions
3. If needed, call `get_transactions` filtered to TRANSFER_IN or TRANSFER_OUT to see the actual counterparties
4. Subtract verified internal transfers (between connected accounts) from spending/income
5. Keep external transfers (to/from non-connected accounts) as real spending or income
6. Show both the raw totals and adjusted totals so the user can verify

From the results, calculate and present:

**Monthly Trend**
Table with columns: Month, Income, Spending, Net, Savings Rate (%). Show all 6 months. Highlight any months where net is negative (spent more than earned).

**Averages**
- Average monthly income
- Average monthly spending
- Average monthly net savings
- Overall savings rate (total net / total income as percentage)

**Cash Position**
- Current total cash (from balances)
- Current total credit used
- Net liquid position (cash minus credit)

**Projection**
At the current average monthly net rate:
- Projected cash balance in 3 months
- Projected cash balance in 6 months
- If net is negative: how many months until cash runs out at this rate

**Observations**
Note any trends: is income growing or shrinking? Is spending accelerating? Are there seasonal patterns? Which direction is the savings rate moving?

Format as clean markdown with tables. Use currency formatting. Keep observations concise and actionable.
