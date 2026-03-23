import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CategoryPieChart, MonthlyBarChart } from './SpendingChart';

// Recharts uses ResizeObserver internally
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

describe('CategoryPieChart', () => {
  it('shows empty message when no data', () => {
    render(<CategoryPieChart data={[]} />);
    expect(screen.getByText('No spending data')).toBeInTheDocument();
  });

  it('renders without crashing with data', () => {
    const data = [
      { category: 'FOOD_AND_DRINK', total: 500, count: 20, percentage: 50 },
      { category: 'TRANSPORTATION', total: 300, count: 10, percentage: 30 },
      { category: 'ENTERTAINMENT', total: 200, count: 5, percentage: 20 },
    ];
    // Recharts ResponsiveContainer needs real DOM dimensions; just verify no crash
    expect(() => render(<CategoryPieChart data={data} />)).not.toThrow();
  });
});

describe('MonthlyBarChart', () => {
  it('shows empty message when no data', () => {
    render(<MonthlyBarChart data={[]} />);
    expect(screen.getByText('No monthly data')).toBeInTheDocument();
  });

  it('renders without crashing with data', () => {
    const data = [
      { month: '2024-01', spending: 3000, income: 5000, net: 2000 },
      { month: '2024-02', spending: 3500, income: 5000, net: 1500 },
    ];
    expect(() => render(<MonthlyBarChart data={data} />)).not.toThrow();
  });
});
