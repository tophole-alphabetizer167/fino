import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api } from './api';

describe('api client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function mockFetch(data: unknown, status = 200) {
    return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(data),
      text: () => Promise.resolve(JSON.stringify(data)),
    } as Response);
  }

  describe('createLinkToken', () => {
    it('posts to /api/plaid/create-link-token', async () => {
      const spy = mockFetch({ link_token: 'link-sandbox-abc' });
      const result = await api.createLinkToken();
      expect(result.link_token).toBe('link-sandbox-abc');
      expect(spy).toHaveBeenCalledWith('/api/plaid/create-link-token', expect.objectContaining({ method: 'POST' }));
    });
  });

  describe('getAccounts', () => {
    it('fetches accounts from /api/accounts', async () => {
      const accounts = [{ id: '1', name: 'Checking', type: 'depository' }];
      const spy = mockFetch(accounts);
      const result = await api.getAccounts();
      expect(result).toEqual(accounts);
      expect(spy).toHaveBeenCalledWith('/api/accounts', expect.objectContaining({
        headers: { 'Content-Type': 'application/json' },
      }));
    });
  });

  describe('getTransactions', () => {
    it('fetches without params', async () => {
      const data = { transactions: [], total: 0 };
      const spy = mockFetch(data);
      await api.getTransactions();
      expect(spy).toHaveBeenCalledWith('/api/transactions', expect.any(Object));
    });

    it('builds query string from params', async () => {
      const data = { transactions: [], total: 0 };
      const spy = mockFetch(data);
      await api.getTransactions({ start_date: '2024-01-01', limit: 10 });
      const url = spy.mock.calls[0][0] as string;
      expect(url).toContain('start_date=2024-01-01');
      expect(url).toContain('limit=10');
    });

    it('omits undefined params', async () => {
      const data = { transactions: [], total: 0 };
      const spy = mockFetch(data);
      await api.getTransactions({ limit: 5, search: undefined });
      const url = spy.mock.calls[0][0] as string;
      expect(url).toContain('limit=5');
      expect(url).not.toContain('search');
    });
  });

  describe('getSpendingByCategory', () => {
    it('fetches with date range', async () => {
      const data = { categories: [], total: 0 };
      const spy = mockFetch(data);
      await api.getSpendingByCategory('2024-01-01', '2024-01-31');
      const url = spy.mock.calls[0][0] as string;
      expect(url).toContain('start_date=2024-01-01');
      expect(url).toContain('end_date=2024-01-31');
    });

    it('fetches without dates', async () => {
      const data = { categories: [], total: 0 };
      const spy = mockFetch(data);
      await api.getSpendingByCategory();
      const url = spy.mock.calls[0][0] as string;
      expect(url).toBe('/api/spending/by-category');
    });
  });

  describe('getMonthlySpending', () => {
    it('includes months param', async () => {
      const spy = mockFetch([]);
      await api.getMonthlySpending(3);
      const url = spy.mock.calls[0][0] as string;
      expect(url).toBe('/api/spending/monthly?months=3');
    });

    it('omits months param when undefined', async () => {
      const spy = mockFetch([]);
      await api.getMonthlySpending();
      const url = spy.mock.calls[0][0] as string;
      expect(url).toBe('/api/spending/monthly');
    });
  });

  describe('getBalances', () => {
    it('fetches balance summary', async () => {
      const data = {
        accounts: [],
        summary: { totalCash: 5000, totalCreditUsed: 500, totalCreditLimit: 10000, totalInvestment: 20000, totalLoan: 0, netWorth: 24500 },
      };
      mockFetch(data);
      const result = await api.getBalances();
      expect(result.summary.netWorth).toBe(24500);
    });
  });

  describe('syncAll', () => {
    it('posts to sync endpoint', async () => {
      const spy = mockFetch({ results: [] });
      await api.syncAll();
      expect(spy).toHaveBeenCalledWith('/api/plaid/sync', expect.objectContaining({ method: 'POST' }));
    });
  });

  describe('deleteItem', () => {
    it('sends DELETE request', async () => {
      const spy = mockFetch({ success: true });
      await api.deleteItem('item-123');
      expect(spy).toHaveBeenCalledWith('/api/plaid/items/item-123', expect.objectContaining({ method: 'DELETE' }));
    });
  });

  describe('confirmImport', () => {
    it('sends accountId and transactions', async () => {
      const spy = mockFetch({ added: 2, skipped: 0, total: 2 });
      const txns = [{ date: '2024-01-01', amount: 10, name: 'Test' }];
      const result = await api.confirmImport('acct-1', txns);
      expect(result.added).toBe(2);
      const body = JSON.parse(spy.mock.calls[0][1]?.body as string);
      expect(body.accountId).toBe('acct-1');
      expect(body.transactions).toEqual(txns);
    });
  });

  describe('createManualAccount', () => {
    it('sends name and type', async () => {
      const spy = mockFetch({ id: 'new-id', name: 'My Cash', type: 'depository', subtype: null });
      const result = await api.createManualAccount('My Cash', 'depository');
      expect(result.id).toBe('new-id');
      const body = JSON.parse(spy.mock.calls[0][1]?.body as string);
      expect(body.name).toBe('My Cash');
      expect(body.type).toBe('depository');
    });
  });

  describe('error handling', () => {
    it('throws on non-ok response', async () => {
      mockFetch({ error: 'Not found' }, 404);
      await expect(api.getAccounts()).rejects.toThrow('API error 404');
    });

    it('throws on 500 response', async () => {
      mockFetch({ error: 'Server error' }, 500);
      await expect(api.getBalances()).rejects.toThrow('API error 500');
    });
  });
});
