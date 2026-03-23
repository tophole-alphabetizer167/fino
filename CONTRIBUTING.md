# Contributing to Fino

Thanks for your interest in contributing. Here's how to get started.

## Setup

```bash
git clone https://github.com/hadijaveed/fino.git
cd fino
npm install
cd client && npm install --legacy-peer-deps && cd ..
cp .env.example .env
npm run db:push
```

You can develop without Plaid keys. The CSV/OFX import and dashboard UI work without a Plaid account. If you want to test Plaid integration, sign up at [dashboard.plaid.com](https://dashboard.plaid.com) for free sandbox keys.

## Development

```bash
npm run dev          # starts Hono server + Vite dev server with hot reload
npm run build        # builds the React frontend
npm test             # runs server tests
npm run test:all     # runs server + client tests
```

## Project Structure

```
server/              Hono API server
  routes/            API endpoints (plaid, accounts, transactions, spending, import)
  lib/               Plaid client, encryption, sync logic, file parsers
  db/                Drizzle schema + SQLite connection
client/              React + Vite frontend
  src/pages/         Dashboard, Accounts, Transactions, Spending, Import
  src/components/    Reusable UI components
mcp/                 MCP server for Claude (stdio transport, 7 tools)
.claude/skills/      Slash command definitions
```

## What to Work On

Check [open issues](https://github.com/hadijaveed/fino/issues) for tasks labeled:

- `good first issue` -- scoped, beginner-friendly tasks
- `help wanted` -- features or fixes where input is welcome
- `no-plaid-needed` -- can be worked on without Plaid API keys

## Making Changes

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Run `npm test` and `npm run build` to verify nothing breaks
4. Open a pull request with a clear description of what changed and why

## Guidelines

- Keep PRs focused. One feature or fix per PR
- Follow existing code patterns. The codebase uses Hono for the server, Drizzle ORM for the database, and React with Tailwind for the frontend
- Do not delete or reset `data/finance.db`. Use ALTER TABLE or migration statements for schema changes
- Test with both Plaid-connected and CSV-imported accounts when relevant

## Areas Where Help Is Welcome

- Additional CSV format support (more banks, international formats)
- Dashboard UI improvements
- New MCP tools or slash commands
- Documentation and guides
- Testing (server + client)
- Docker support
- Mobile-responsive dashboard

## Questions?

Open a [GitHub Discussion](https://github.com/hadijaveed/fino/discussions) or file an issue.
