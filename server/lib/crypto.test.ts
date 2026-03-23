import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { encrypt, decrypt } from './crypto.js';

describe('crypto', () => {
  const originalKey = process.env.ENCRYPTION_KEY;

  beforeAll(() => {
    // 64 hex chars = 32 bytes
    process.env.ENCRYPTION_KEY = 'a'.repeat(64);
  });

  afterAll(() => {
    if (originalKey) {
      process.env.ENCRYPTION_KEY = originalKey;
    } else {
      delete process.env.ENCRYPTION_KEY;
    }
  });

  describe('encrypt', () => {
    it('returns encrypted string and iv', () => {
      const result = encrypt('hello world');
      expect(result).toHaveProperty('encrypted');
      expect(result).toHaveProperty('iv');
      expect(result.encrypted).toContain(':'); // encrypted:authTag format
      expect(result.iv).toHaveLength(32); // 16 bytes as hex
    });

    it('produces different ciphertext on each call (random IV)', () => {
      const r1 = encrypt('same plaintext');
      const r2 = encrypt('same plaintext');
      expect(r1.encrypted).not.toEqual(r2.encrypted);
      expect(r1.iv).not.toEqual(r2.iv);
    });
  });

  describe('decrypt', () => {
    it('roundtrips encrypt then decrypt', () => {
      const plaintext = 'access-sandbox-12345-abcdef';
      const { encrypted, iv } = encrypt(plaintext);
      const result = decrypt(encrypted, iv);
      expect(result).toBe(plaintext);
    });

    it('handles empty string', () => {
      const { encrypted, iv } = encrypt('');
      expect(decrypt(encrypted, iv)).toBe('');
    });

    it('handles unicode characters', () => {
      const plaintext = 'token_with_special_chars_!@#$%^&*()';
      const { encrypted, iv } = encrypt(plaintext);
      expect(decrypt(encrypted, iv)).toBe(plaintext);
    });

    it('handles long strings', () => {
      const plaintext = 'x'.repeat(10000);
      const { encrypted, iv } = encrypt(plaintext);
      expect(decrypt(encrypted, iv)).toBe(plaintext);
    });

    it('throws on tampered ciphertext', () => {
      const { encrypted, iv } = encrypt('sensitive');
      const tampered = 'ff' + encrypted.slice(2);
      expect(() => decrypt(tampered, iv)).toThrow();
    });

    it('throws on wrong IV', () => {
      const { encrypted } = encrypt('sensitive');
      const wrongIv = 'b'.repeat(32);
      expect(() => decrypt(encrypted, wrongIv)).toThrow();
    });
  });

  describe('getKey validation', () => {
    it('throws when ENCRYPTION_KEY is missing', () => {
      const saved = process.env.ENCRYPTION_KEY;
      delete process.env.ENCRYPTION_KEY;
      expect(() => encrypt('test')).toThrow('ENCRYPTION_KEY must be a 64-character hex string');
      process.env.ENCRYPTION_KEY = saved;
    });

    it('throws when ENCRYPTION_KEY is wrong length', () => {
      const saved = process.env.ENCRYPTION_KEY;
      process.env.ENCRYPTION_KEY = 'abc123';
      expect(() => encrypt('test')).toThrow('ENCRYPTION_KEY must be a 64-character hex string');
      process.env.ENCRYPTION_KEY = saved;
    });
  });
});
