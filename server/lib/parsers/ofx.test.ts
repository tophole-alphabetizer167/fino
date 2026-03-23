import { describe, it, expect } from 'vitest';
import { parseOfx } from './ofx.js';

describe('parseOfx', () => {
  describe('basic OFX parsing', () => {
    it('parses a single SGML-style transaction', () => {
      const ofx = `
<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKTRANLIST>
<STMTTRN>
<DTPOSTED>20240115
<TRNAMT>-50.00
<NAME>Grocery Store
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;
      const result = parseOfx(ofx);
      expect(result.detectedFormat).toBe('OFX');
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0]).toEqual({
        date: '2024-01-15',
        amount: 50, // -(-50) = 50, money out in Plaid convention
        name: 'Grocery Store',
        merchantName: null,
        categoryPrimary: null,
      });
    });

    it('parses XML-style OFX transactions', () => {
      const ofx = `
<STMTTRN>
<DTPOSTED>20240220</DTPOSTED>
<TRNAMT>-25.50</TRNAMT>
<NAME>Coffee Shop</NAME>
<MEMO>STARBUCKS #1234</MEMO>
</STMTTRN>`;
      const result = parseOfx(ofx);
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].amount).toBe(25.50); // money out
      expect(result.transactions[0].name).toBe('Coffee Shop');
      expect(result.transactions[0].merchantName).toBe('STARBUCKS #1234');
    });

    it('parses income (positive OFX amount becomes negative Plaid)', () => {
      const ofx = `
<STMTTRN>
<DTPOSTED>20240301
<TRNAMT>3000.00
<NAME>Direct Deposit - Payroll
</STMTTRN>`;
      const result = parseOfx(ofx);
      expect(result.transactions[0].amount).toBe(-3000); // money in
    });

    it('handles multiple transactions', () => {
      const ofx = `
<STMTTRN>
<DTPOSTED>20240115
<TRNAMT>-10.00
<NAME>Purchase 1
</STMTTRN>
<STMTTRN>
<DTPOSTED>20240116
<TRNAMT>-20.00
<NAME>Purchase 2
</STMTTRN>
<STMTTRN>
<DTPOSTED>20240117
<TRNAMT>500.00
<NAME>Deposit
</STMTTRN>`;
      const result = parseOfx(ofx);
      expect(result.transactions).toHaveLength(3);
      expect(result.transactions[0].amount).toBe(10);
      expect(result.transactions[1].amount).toBe(20);
      expect(result.transactions[2].amount).toBe(-500);
    });
  });

  describe('date parsing', () => {
    it('parses YYYYMMDD format', () => {
      const ofx = `<STMTTRN><DTPOSTED>20240315<TRNAMT>-10<NAME>Test</STMTTRN>`;
      const result = parseOfx(ofx);
      expect(result.transactions[0].date).toBe('2024-03-15');
    });

    it('parses date with time component', () => {
      const ofx = `<STMTTRN><DTPOSTED>20240315120000<TRNAMT>-10<NAME>Test</STMTTRN>`;
      const result = parseOfx(ofx);
      expect(result.transactions[0].date).toBe('2024-03-15');
    });

    it('parses date with timezone bracket', () => {
      const ofx = `<STMTTRN><DTPOSTED>20240315120000.000[-5:EST]<TRNAMT>-10<NAME>Test</STMTTRN>`;
      const result = parseOfx(ofx);
      expect(result.transactions[0].date).toBe('2024-03-15');
    });
  });

  describe('edge cases', () => {
    it('skips transactions missing date', () => {
      const ofx = `<STMTTRN><TRNAMT>-10<NAME>No Date</STMTTRN>`;
      const result = parseOfx(ofx);
      expect(result.transactions).toHaveLength(0);
    });

    it('skips transactions missing amount', () => {
      const ofx = `<STMTTRN><DTPOSTED>20240115<NAME>No Amount</STMTTRN>`;
      const result = parseOfx(ofx);
      expect(result.transactions).toHaveLength(0);
    });

    it('uses MEMO as name when NAME is missing', () => {
      const ofx = `<STMTTRN><DTPOSTED>20240115<TRNAMT>-5<MEMO>Memo Only</STMTTRN>`;
      const result = parseOfx(ofx);
      expect(result.transactions[0].name).toBe('Memo Only');
      expect(result.transactions[0].merchantName).toBe(null); // memo === name, so null
    });

    it('sets merchantName to MEMO when different from NAME', () => {
      const ofx = `<STMTTRN><DTPOSTED>20240115<TRNAMT>-5<NAME>Store<MEMO>STORE #123 CITY ST</STMTTRN>`;
      const result = parseOfx(ofx);
      expect(result.transactions[0].name).toBe('Store');
      expect(result.transactions[0].merchantName).toBe('STORE #123 CITY ST');
    });

    it('returns empty array for content with no transactions', () => {
      const result = parseOfx('<OFX><SIGNONMSGSRSV1></SIGNONMSGSRSV1></OFX>');
      expect(result.transactions).toEqual([]);
    });

    it('defaults name to Unknown when both NAME and MEMO are missing', () => {
      const ofx = `<STMTTRN><DTPOSTED>20240115<TRNAMT>-10</STMTTRN>`;
      const result = parseOfx(ofx);
      expect(result.transactions[0].name).toBe('Unknown');
    });
  });
});
