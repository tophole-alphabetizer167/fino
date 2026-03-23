import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BalanceCards } from './BalanceCards';

vi.mock('../lib/api', () => ({
  api: {
    getBalances: vi.fn(),
  },
}));

import { api } from '../lib/api';

const mockSummary = {
  accounts: [],
  summary: {
    totalCash: 15000.50,
    totalCreditUsed: 2500.75,
    totalCreditLimit: 10000,
    totalInvestment: 50000,
    totalLoan: 0,
    netWorth: 62499.75,
  },
};

describe('BalanceCards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading skeleton initially', () => {
    vi.mocked(api.getBalances).mockReturnValue(new Promise(() => {})); // never resolves
    const { container } = render(<BalanceCards />);
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBe(4);
  });

  it('renders all 4 cards with correct labels', async () => {
    vi.mocked(api.getBalances).mockResolvedValue(mockSummary);
    render(<BalanceCards />);
    await waitFor(() => {
      expect(screen.getByText('Cash')).toBeInTheDocument();
      expect(screen.getByText('Credit Used')).toBeInTheDocument();
      expect(screen.getByText('Investments')).toBeInTheDocument();
      expect(screen.getByText('Net Worth')).toBeInTheDocument();
    });
  });

  it('displays formatted currency values', async () => {
    vi.mocked(api.getBalances).mockResolvedValue(mockSummary);
    render(<BalanceCards />);
    await waitFor(() => {
      expect(screen.getByText('$15,000.50')).toBeInTheDocument();
      expect(screen.getByText('$2,500.75')).toBeInTheDocument();
      expect(screen.getByText('$50,000.00')).toBeInTheDocument();
      expect(screen.getByText('$62,499.75')).toBeInTheDocument();
    });
  });

  it('calls getBalances on mount', () => {
    vi.mocked(api.getBalances).mockResolvedValue(mockSummary);
    render(<BalanceCards />);
    expect(api.getBalances).toHaveBeenCalledTimes(1);
  });

  it('handles API error gracefully (stays in loading)', async () => {
    vi.mocked(api.getBalances).mockRejectedValue(new Error('Network error'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(<BalanceCards />);
    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled();
    });
    // Should still show skeleton since summary is null
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBe(4);
    consoleSpy.mockRestore();
  });
});
