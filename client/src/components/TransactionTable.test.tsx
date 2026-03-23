import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TransactionTable } from './TransactionTable';

const mockTransactions = [
  {
    id: 'txn-1',
    amount: 42.50,
    date: '2024-01-15',
    name: 'GROCERY STORE',
    merchantName: 'Whole Foods',
    pending: false,
    categoryPrimary: 'FOOD_AND_DRINK',
    accountName: 'Checking',
    accountMask: '1234',
  },
  {
    id: 'txn-2',
    amount: -2500,
    date: '2024-01-14',
    name: 'PAYROLL',
    merchantName: null,
    pending: false,
    categoryPrimary: 'INCOME',
    accountName: 'Checking',
    accountMask: '1234',
  },
  {
    id: 'txn-3',
    amount: 15.00,
    date: '2024-01-13',
    name: 'UBER TRIP',
    merchantName: 'Uber',
    pending: true,
    categoryPrimary: 'TRANSPORTATION',
    accountName: 'Credit Card',
    accountMask: '5678',
  },
];

describe('TransactionTable', () => {
  describe('empty state', () => {
    it('shows empty message when no transactions', () => {
      render(<TransactionTable transactions={[]} />);
      expect(screen.getByText(/no transactions found/i)).toBeInTheDocument();
      expect(screen.getByText(/connect a bank account/i)).toBeInTheDocument();
    });
  });

  describe('full mode', () => {
    it('renders all column headers', () => {
      render(<TransactionTable transactions={mockTransactions} />);
      expect(screen.getByText('Date')).toBeInTheDocument();
      expect(screen.getByText('Description')).toBeInTheDocument();
      expect(screen.getByText('Category')).toBeInTheDocument();
      expect(screen.getByText('Account')).toBeInTheDocument();
      expect(screen.getByText('Amount')).toBeInTheDocument();
    });

    it('shows merchant name as primary label', () => {
      render(<TransactionTable transactions={mockTransactions} />);
      expect(screen.getByText('Whole Foods')).toBeInTheDocument();
    });

    it('falls back to name when merchantName is null', () => {
      render(<TransactionTable transactions={mockTransactions} />);
      expect(screen.getByText('PAYROLL')).toBeInTheDocument();
    });

    it('shows pending badge for pending transactions', () => {
      render(<TransactionTable transactions={mockTransactions} />);
      expect(screen.getByText('Pending')).toBeInTheDocument();
    });

    it('formats income with + prefix and spending without', () => {
      render(<TransactionTable transactions={mockTransactions} />);
      // Income: -2500 should show as +$2,500.00
      expect(screen.getByText('+$2,500.00')).toBeInTheDocument();
      // Spending: 42.50 should show as $42.50
      expect(screen.getByText('$42.50')).toBeInTheDocument();
    });

    it('shows category (formatted)', () => {
      render(<TransactionTable transactions={mockTransactions} />);
      expect(screen.getByText('food and drink')).toBeInTheDocument();
      expect(screen.getByText('transportation')).toBeInTheDocument();
    });

    it('shows account with mask', () => {
      render(<TransactionTable transactions={mockTransactions} />);
      const matches = screen.getAllByText('Checking ...1234');
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });

    it('shows ISO date in full mode', () => {
      render(<TransactionTable transactions={mockTransactions} />);
      expect(screen.getByText('2024-01-15')).toBeInTheDocument();
    });
  });

  describe('compact mode', () => {
    it('hides Category and Account columns', () => {
      render(<TransactionTable transactions={mockTransactions} compact />);
      expect(screen.queryByText('Category')).not.toBeInTheDocument();
      expect(screen.queryByText('Account')).not.toBeInTheDocument();
    });

    it('still shows Date, Description, Amount headers', () => {
      render(<TransactionTable transactions={mockTransactions} compact />);
      expect(screen.getByText('Date')).toBeInTheDocument();
      expect(screen.getByText('Description')).toBeInTheDocument();
      expect(screen.getByText('Amount')).toBeInTheDocument();
    });

    it('shows relative dates', () => {
      // Use a recent date for relative format
      const recentTxns = [{
        ...mockTransactions[0],
        date: new Date().toISOString().split('T')[0],
      }];
      render(<TransactionTable transactions={recentTxns} compact />);
      // Should show relative time like "less than a minute ago" or "today"
      expect(screen.queryByText(recentTxns[0].date)).not.toBeInTheDocument();
    });
  });

  describe('color coding', () => {
    it('applies emerald color to income amounts', () => {
      render(<TransactionTable transactions={[mockTransactions[1]]} />);
      const amountCell = screen.getByText('+$2,500.00');
      expect(amountCell.className).toContain('emerald');
    });

    it('does not apply emerald color to spending amounts', () => {
      render(<TransactionTable transactions={[mockTransactions[0]]} />);
      const amountCell = screen.getByText('$42.50');
      expect(amountCell.className).not.toContain('emerald');
    });
  });
});
