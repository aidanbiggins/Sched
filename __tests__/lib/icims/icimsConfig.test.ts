/**
 * Tests for iCIMS Configuration
 */

import {
  validateIcimsConfig,
  getIcimsConfig,
  isIcimsRealMode,
  getIcimsConfigSummary,
} from '@/lib/icims/icimsConfig';

describe('iCIMS Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('validateIcimsConfig', () => {
    it('returns valid config for mock mode', () => {
      process.env.ICIMS_MODE = 'mock';

      const result = validateIcimsConfig();

      expect(result.valid).toBe(true);
      expect(result.config).toEqual({
        mode: 'mock',
        baseUrl: '',
        apiKey: '',
      });
      expect(result.errors).toHaveLength(0);
    });

    it('defaults to mock mode when ICIMS_MODE not set', () => {
      delete process.env.ICIMS_MODE;

      const result = validateIcimsConfig();

      expect(result.valid).toBe(true);
      expect(result.config?.mode).toBe('mock');
    });

    it('returns valid config for real mode with valid config', () => {
      process.env.ICIMS_MODE = 'real';
      process.env.ICIMS_BASE_URL = 'https://api.icims.com';
      process.env.ICIMS_API_KEY = 'test-api-key-12345';

      const result = validateIcimsConfig();

      expect(result.valid).toBe(true);
      expect(result.config).toEqual({
        mode: 'real',
        baseUrl: 'https://api.icims.com',
        apiKey: 'test-api-key-12345',
      });
      expect(result.errors).toHaveLength(0);
    });

    it('returns error when ICIMS_BASE_URL missing in real mode', () => {
      process.env.ICIMS_MODE = 'real';
      process.env.ICIMS_API_KEY = 'test-api-key-12345';
      delete process.env.ICIMS_BASE_URL;

      const result = validateIcimsConfig();

      expect(result.valid).toBe(false);
      expect(result.config).toBeNull();
      expect(result.errors).toContain(
        'ICIMS_BASE_URL is required when ICIMS_MODE=real'
      );
    });

    it('returns error when ICIMS_API_KEY missing in real mode', () => {
      process.env.ICIMS_MODE = 'real';
      process.env.ICIMS_BASE_URL = 'https://api.icims.com';
      delete process.env.ICIMS_API_KEY;

      const result = validateIcimsConfig();

      expect(result.valid).toBe(false);
      expect(result.config).toBeNull();
      expect(result.errors).toContain(
        'ICIMS_API_KEY is required when ICIMS_MODE=real'
      );
    });

    it('returns error for invalid URL format', () => {
      process.env.ICIMS_MODE = 'real';
      process.env.ICIMS_BASE_URL = 'not-a-valid-url';
      process.env.ICIMS_API_KEY = 'test-api-key-12345';

      const result = validateIcimsConfig();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('ICIMS_BASE_URL must be a valid URL');
    });

    it('returns error for API key that is too short', () => {
      process.env.ICIMS_MODE = 'real';
      process.env.ICIMS_BASE_URL = 'https://api.icims.com';
      process.env.ICIMS_API_KEY = 'short';

      const result = validateIcimsConfig();

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'ICIMS_API_KEY appears to be invalid (too short)'
      );
    });

    it('normalizes base URL by removing trailing slash', () => {
      process.env.ICIMS_MODE = 'real';
      process.env.ICIMS_BASE_URL = 'https://api.icims.com/';
      process.env.ICIMS_API_KEY = 'test-api-key-12345';

      const result = validateIcimsConfig();

      expect(result.valid).toBe(true);
      expect(result.config?.baseUrl).toBe('https://api.icims.com');
    });
  });

  describe('getIcimsConfig', () => {
    it('returns config for valid configuration', () => {
      process.env.ICIMS_MODE = 'mock';

      const config = getIcimsConfig();

      expect(config.mode).toBe('mock');
    });

    it('throws error for invalid configuration', () => {
      process.env.ICIMS_MODE = 'real';
      delete process.env.ICIMS_BASE_URL;
      delete process.env.ICIMS_API_KEY;

      expect(() => getIcimsConfig()).toThrow('iCIMS configuration invalid');
    });
  });

  describe('isIcimsRealMode', () => {
    it('returns true when ICIMS_MODE is real', () => {
      process.env.ICIMS_MODE = 'real';

      expect(isIcimsRealMode()).toBe(true);
    });

    it('returns false when ICIMS_MODE is mock', () => {
      process.env.ICIMS_MODE = 'mock';

      expect(isIcimsRealMode()).toBe(false);
    });

    it('returns false when ICIMS_MODE not set', () => {
      delete process.env.ICIMS_MODE;

      expect(isIcimsRealMode()).toBe(false);
    });
  });

  describe('getIcimsConfigSummary', () => {
    it('returns config summary without secrets', () => {
      process.env.ICIMS_MODE = 'real';
      process.env.ICIMS_BASE_URL = 'https://api.icims.com';
      process.env.ICIMS_API_KEY = 'secret-api-key';

      const summary = getIcimsConfigSummary();

      expect(summary.mode).toBe('real');
      expect(summary.baseUrl).toBe('https://api.icims.com');
      expect(summary.hasApiKey).toBe(true);
      // Should not include actual API key
      expect(summary).not.toHaveProperty('apiKey');
    });

    it('returns hasApiKey false when not set', () => {
      process.env.ICIMS_MODE = 'mock';
      delete process.env.ICIMS_API_KEY;

      const summary = getIcimsConfigSummary();

      expect(summary.hasApiKey).toBe(false);
    });
  });
});
