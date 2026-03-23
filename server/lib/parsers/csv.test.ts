import { describe, it, expect } from 'vitest';
import { parseCsv } from './csv.js';

describe('parseCsv', () => {
  describe('empty/minimal input', () => {
    it('returns empty for empty string', () => {
      const result = parseCsv('');
      expect(result.transactions).toEqual([]);
      expect(result.detectedFormat).toBe('empty');
    });

    it('returns empty for header-only CSV', () => {
      const result = parseCsv('Date,Amount,Description');
      expect(result.transactions).toEqual([]);
      expect(result.detectedFormat).toBe('empty');
    });
  });

  describe('Apple Card format', () => {
    const appleCardHeaders = 'Transaction Date,Clearing Date,Description,Merchant,Category,Type,Amount';

    it('detects Apple Card format', () => {
      const csv = `${appleCardHeaders}\n01/15/2024,,Coffee Shop,Starbucks,Food & Drink,Purchase,-5.75`;
      const result = parseCsv(csv);
      expect(result.detectedFormat).toBe('Apple Card');
    });

    it('parses Apple Card purchase (negative becomes positive = money out)', () => {
      const csv = `${appleCardHeaders}\n01/15/2024,,Coffee Shop,Starbucks,Food & Drink,Purchase,-5.75`;
      const result = parseCsv(csv);
      expect(result.transactions).toHaveLength(1);
      const txn = result.transactions[0];
      expect(txn.amount).toBe(5.75); // -(-5.75) = 5.75 (money out)
      expect(txn.date).toBe('2024-01-15');
      expect(txn.name).toBe('Coffee Shop');
      expect(txn.merchantName).toBe('Starbucks');
      expect(txn.categoryPrimary).toBe('Food & Drink');
    });

    it('parses Apple Card payment/credit (positive becomes negative = money in)', () => {
      const csv = `${appleCardHeaders}\n02/01/2024,,Payment Thank You,,Payment,Payment,500.00`;
      const result = parseCsv(csv);
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].amount).toBe(-500); // -(500) = -500 (money in)
    });

    it('handles multiple Apple Card transactions', () => {
      const csv = [
        appleCardHeaders,
        '01/10/2024,,Amazon,Amazon.com,Shopping,Purchase,-29.99',
        '01/11/2024,,Uber,Uber Technologies,Transportation,Purchase,-15.50',
        '01/12/2024,,Refund,Amazon.com,Shopping,Return,29.99',
      ].join('\n');
      const result = parseCsv(csv);
      expect(result.transactions).toHaveLength(3);
      expect(result.transactions[0].amount).toBe(29.99);
      expect(result.transactions[1].amount).toBe(15.50);
      expect(result.transactions[2].amount).toBe(-29.99);
    });

    it('uses description when merchant is empty', () => {
      const csv = `${appleCardHeaders}\n01/15/2024,,Some Payment,,,Payment,100.00`;
      const result = parseCsv(csv);
      expect(result.transactions[0].name).toBe('Some Payment');
      expect(result.transactions[0].merchantName).toBeNull();
    });
  });

  describe('generic CSV format', () => {
    it('parses basic Date/Amount/Description CSV', () => {
      const csv = 'Date,Amount,Description\n2024-01-15,42.50,Grocery Store';
      const result = parseCsv(csv);
      expect(result.detectedFormat).toBe('Generic CSV');
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0]).toEqual({
        date: '2024-01-15',
        amount: 42.50,
        name: 'Grocery Store',
        merchantName: null,
        categoryPrimary: null,
      });
    });

    it('handles various date formats', () => {
      const csv = [
        'Date,Amount,Description',
        '2024-01-15,10,ISO format',
        '1/5/2024,20,US slash short',
        '01/15/2024,30,US slash padded',
        '03-15-2024,40,US dash format',
      ].join('\n');
      const result = parseCsv(csv);
      expect(result.transactions.map((t) => t.date)).toEqual([
        '2024-01-15',
        '2024-01-05',
        '2024-01-15',
        '2024-03-15',
      ]);
    });

    it('handles alternative header names', () => {
      const csv = 'Posting Date,Transaction Amount,Memo\n01/20/2024,15.99,Netflix';
      const result = parseCsv(csv);
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].amount).toBe(15.99);
      expect(result.transactions[0].name).toBe('Netflix');
    });

    it('handles debit/credit columns', () => {
      const csv = [
        'Date,Description,Debit Amount,Credit Amount',
        '2024-01-15,Coffee Shop,5.00,',
        '2024-01-16,Paycheck,,2000.00',
      ].join('\n');
      const result = parseCsv(csv);
      expect(result.transactions).toHaveLength(2);
      expect(result.transactions[0].amount).toBe(5); // debit = money out
      expect(result.transactions[1].amount).toBe(-2000); // credit = money in
    });

    it('handles merchant and category columns', () => {
      const csv = 'Date,Amount,Description,Merchant,Category\n2024-01-15,25.00,Lunch,Chipotle,Food';
      const result = parseCsv(csv);
      expect(result.transactions[0].merchantName).toBe('Chipotle');
      expect(result.transactions[0].categoryPrimary).toBe('Food');
    });

    it('throws if no date column found', () => {
      const csv = 'Amount,Description\n10.00,Something';
      expect(() => parseCsv(csv)).toThrow('Could not detect a date column');
    });

    it('throws if no amount column found', () => {
      const csv = 'Date,Description\n2024-01-15,Something';
      expect(() => parseCsv(csv)).toThrow('Could not detect an amount column');
    });
  });

  describe('amount parsing', () => {
    it('strips currency symbols', () => {
      const csv = 'Date,Amount,Description\n2024-01-15,$42.50,Test';
      const result = parseCsv(csv);
      expect(result.transactions[0].amount).toBe(42.50);
    });

    it('handles parentheses as negative', () => {
      const csv = 'Date,Amount,Description\n2024-01-15,(100.00),Refund';
      const result = parseCsv(csv);
      expect(result.transactions[0].amount).toBe(-100);
    });

    it('handles euro symbol', () => {
      const csv = 'Date,Amount,Description\n2024-01-15,\u20AC50.00,Purchase';
      const result = parseCsv(csv);
      expect(result.transactions[0].amount).toBe(50);
    });

    it('returns 0 for unparseable amounts', () => {
      const csv = 'Date,Amount,Description\n2024-01-15,N/A,Unknown';
      const result = parseCsv(csv);
      expect(result.transactions[0].amount).toBe(0);
    });
  });

  describe('CSV parsing edge cases', () => {
    it('handles quoted fields with commas', () => {
      const csv = 'Date,Amount,Description\n2024-01-15,50.00,"Smith, John - Payment"';
      const result = parseCsv(csv);
      expect(result.transactions[0].name).toBe('Smith, John - Payment');
    });

    it('handles escaped quotes inside quoted fields', () => {
      const csv = 'Date,Amount,Description\n2024-01-15,25.00,"He said ""hello"""';
      const result = parseCsv(csv);
      expect(result.transactions[0].name).toBe('He said "hello"');
    });

    it('handles Windows line endings', () => {
      const csv = 'Date,Amount,Description\r\n2024-01-15,10.00,Test1\r\n2024-01-16,20.00,Test2';
      const result = parseCsv(csv);
      expect(result.transactions).toHaveLength(2);
    });

    it('skips blank lines', () => {
      const csv = 'Date,Amount,Description\n\n2024-01-15,10.00,Test\n\n';
      const result = parseCsv(csv);
      expect(result.transactions).toHaveLength(1);
    });
  });
});
