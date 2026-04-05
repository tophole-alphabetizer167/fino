const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`API error ${res.status}: ${error}`);
  }
  return res.json();
}

export const api = {
  // Plaid
  createLinkToken: () =>
    request<{ link_token: string }>('/plaid/create-link-token', { method: 'POST' }),

  exchangeToken: (publicToken: string, metadata: unknown) =>
    request('/plaid/exchange-token', {
      method: 'POST',
      body: JSON.stringify({ public_token: publicToken, metadata }),
    }),

  syncAll: () =>
    request('/plaid/sync', { method: 'POST' }),

  deleteItem: (itemId: string) =>
    request(`/plaid/items/${itemId}`, { method: 'DELETE' }),

  // Accounts
  getAccounts: () =>
    request<Array<{
      id: string;
      name: string;
      officialName: string | null;
      type: string;
      subtype: string | null;
      mask: string | null;
      currentBalance: number | null;
      availableBalance: number | null;
      creditLimit: number | null;
      itemId: string;
      institutionName: string | null;
      connectionStatus: string | null;
      lastSyncedAt: string | null;
    }>>('/accounts'),

  // Transactions
  getTransactions: (params?: {
    start_date?: string;
    end_date?: string;
    account_id?: string;
    category?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) searchParams.set(key, String(value));
      });
    }
    const qs = searchParams.toString();
    return request<{
      transactions: Array<{
        id: string;
        amount: number;
        date: string;
        name: string;
        merchantName: string | null;
        merchantLogoUrl: string | null;
        pending: boolean;
        categoryPrimary: string | null;
        categoryDetailed: string | null;
        categoryIcon: string | null;
        paymentChannel: string | null;
        accountName: string | null;
        accountType: string | null;
        accountMask: string | null;
      }>;
      total: number;
    }>(`/transactions${qs ? '?' + qs : ''}`);
  },

  // Spending
  getMonthlySpending: (months?: number) => {
    const params = months ? `?months=${months}` : '';
    return request<Array<{
      month: string;
      spending: number;
      income: number;
      net: number;
    }>>(`/spending/monthly${params}`);
  },

  getBalances: () =>
    request<{
      accounts: Array<{
        id: string;
        name: string;
        type: string;
        subtype: string | null;
        currentBalance: number | null;
        availableBalance: number | null;
        creditLimit: number | null;
      }>;
      summary: {
        totalCash: number;
        totalCreditUsed: number;
        totalCreditLimit: number;
        totalInvestment: number;
        totalLoan: number;
        netWorth: number;
      };
    }>('/spending/balances'),

  // Import
  uploadFile: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${BASE}/import/upload`, { method: 'POST', body: formData });
    if (!res.ok) {
      const text = await res.text();
      try {
        const error = JSON.parse(text);
        throw new Error(error.error || `Upload failed: ${res.status}`);
      } catch {
        throw new Error(`Upload failed: ${res.status}`);
      }
    }
    return res.json() as Promise<{
      format: string;
      count: number;
      transactions: Array<{
        date: string;
        amount: number;
        name: string;
        merchantName: string | null;
        categoryPrimary: string | null;
      }>;
      dateRange: { from: string; to: string };
    }>;
  },

  confirmImport: (accountId: string, transactions: unknown[]) =>
    request<{ added: number; skipped: number; total: number }>('/import/confirm', {
      method: 'POST',
      body: JSON.stringify({ accountId, transactions }),
    }),

  createManualAccount: (name: string, type: string, subtype?: string) =>
    request<{ id: string; name: string; type: string; subtype: string | null }>('/import/accounts', {
      method: 'POST',
      body: JSON.stringify({ name, type, subtype }),
    }),

  getManualAccounts: () =>
    request<Array<{ id: string; name: string; type: string; subtype: string | null; source: string }>>('/import/accounts'),

  // Learnings
  getLearnings: () =>
    request<Array<{
      id: string;
      memoryType: string;
      description: string;
      content: string;
      period: string | null;
      isStale: boolean;
      createdAt: string;
      updatedAt: string;
    }>>('/learnings'),

  markLearningStale: (id: string) =>
    request<{ ok: boolean }>(`/learnings/${encodeURIComponent(id)}/stale`, { method: 'PATCH' }),

  deleteLearning: (id: string) =>
    request<{ ok: boolean }>(`/learnings/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};
