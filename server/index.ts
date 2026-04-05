import 'dotenv/config';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import plaidRoutes from './routes/plaid.js';
import accountsRoutes from './routes/accounts.js';
import transactionsRoutes from './routes/transactions.js';
import spendingRoutes from './routes/spending.js';
import importRoutes from './routes/import.js';
import learningsRoutes from './routes/learnings.js';

// Ensure data directory and db exist
import './db/index.js';

const app = new Hono();

app.use('*', logger());
app.use('/api/*', cors({ origin: 'http://localhost:5173' }));

// API routes
app.route('/api/plaid', plaidRoutes);
app.route('/api/accounts', accountsRoutes);
app.route('/api/transactions', transactionsRoutes);
app.route('/api/spending', spendingRoutes);
app.route('/api/import', importRoutes);
app.route('/api/learnings', learningsRoutes);

app.get('/api/health', (c) => c.json({ status: 'ok' }));

// Serve static frontend (built Vite output)
app.use('/*', serveStatic({ root: './client/dist' }));
// SPA fallback: serve index.html for client-side routing
app.use('/*', serveStatic({ root: './client/dist', path: 'index.html' }));

const port = parseInt(process.env.PORT || '3001');
console.log(`Server running at http://localhost:${port}`);

serve({ fetch: app.fetch, port });
