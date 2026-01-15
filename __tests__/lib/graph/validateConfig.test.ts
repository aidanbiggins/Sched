/**
 * Unit tests for validateConfig module
 *
 * Tests configuration validation for Graph API settings.
 */

import {
  validateGraphConfig,
  isGraphModeReal,
  GraphConfigError,
} from '@/lib/graph/validateConfig';

describe('validateGraphConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns valid config when all required fields present', () => {
    process.env.GRAPH_TENANT_ID = '00000000-0000-0000-0000-000000000001';
    process.env.GRAPH_CLIENT_ID = '00000000-0000-0000-0000-000000000002';
    process.env.GRAPH_CLIENT_SECRET = 'test-secret-12345';
    process.env.GRAPH_ORGANIZER_EMAIL = 'scheduling@test.com';

    const config = validateGraphConfig();

    expect(config.tenantId).toBe('00000000-0000-0000-0000-000000000001');
    expect(config.clientId).toBe('00000000-0000-0000-0000-000000000002');
    expect(config.clientSecret).toBe('test-secret-12345');
    expect(config.organizerEmail).toBe('scheduling@test.com');
    expect(config.maxRetries).toBe(3); // default
    expect(config.retryDelayMs).toBe(1000); // default
  });

  it('accepts custom retry settings', () => {
    process.env.GRAPH_TENANT_ID = '00000000-0000-0000-0000-000000000001';
    process.env.GRAPH_CLIENT_ID = '00000000-0000-0000-0000-000000000002';
    process.env.GRAPH_CLIENT_SECRET = 'test-secret-12345';
    process.env.GRAPH_ORGANIZER_EMAIL = 'scheduling@test.com';
    process.env.GRAPH_MAX_RETRIES = '5';
    process.env.GRAPH_RETRY_DELAY_MS = '2000';

    const config = validateGraphConfig();

    expect(config.maxRetries).toBe(5);
    expect(config.retryDelayMs).toBe(2000);
  });

  it('throws on missing tenant ID', () => {
    process.env.GRAPH_CLIENT_ID = '00000000-0000-0000-0000-000000000002';
    process.env.GRAPH_CLIENT_SECRET = 'test-secret-12345';
    process.env.GRAPH_ORGANIZER_EMAIL = 'scheduling@test.com';

    expect(() => validateGraphConfig()).toThrow(GraphConfigError);
    expect(() => validateGraphConfig()).toThrow('GRAPH_TENANT_ID');
  });

  it('throws on missing client ID', () => {
    process.env.GRAPH_TENANT_ID = '00000000-0000-0000-0000-000000000001';
    process.env.GRAPH_CLIENT_SECRET = 'test-secret-12345';
    process.env.GRAPH_ORGANIZER_EMAIL = 'scheduling@test.com';

    expect(() => validateGraphConfig()).toThrow(GraphConfigError);
    expect(() => validateGraphConfig()).toThrow('GRAPH_CLIENT_ID');
  });

  it('throws on missing client secret', () => {
    process.env.GRAPH_TENANT_ID = '00000000-0000-0000-0000-000000000001';
    process.env.GRAPH_CLIENT_ID = '00000000-0000-0000-0000-000000000002';
    process.env.GRAPH_ORGANIZER_EMAIL = 'scheduling@test.com';

    expect(() => validateGraphConfig()).toThrow(GraphConfigError);
    expect(() => validateGraphConfig()).toThrow('GRAPH_CLIENT_SECRET');
  });

  it('throws on missing organizer email', () => {
    process.env.GRAPH_TENANT_ID = '00000000-0000-0000-0000-000000000001';
    process.env.GRAPH_CLIENT_ID = '00000000-0000-0000-0000-000000000002';
    process.env.GRAPH_CLIENT_SECRET = 'test-secret-12345';

    expect(() => validateGraphConfig()).toThrow(GraphConfigError);
    expect(() => validateGraphConfig()).toThrow('GRAPH_ORGANIZER_EMAIL');
  });

  it('throws on invalid tenant ID format', () => {
    process.env.GRAPH_TENANT_ID = 'not-a-uuid';
    process.env.GRAPH_CLIENT_ID = '00000000-0000-0000-0000-000000000002';
    process.env.GRAPH_CLIENT_SECRET = 'test-secret-12345';
    process.env.GRAPH_ORGANIZER_EMAIL = 'scheduling@test.com';

    expect(() => validateGraphConfig()).toThrow(GraphConfigError);
    expect(() => validateGraphConfig()).toThrow('Must be a valid UUID');
  });

  it('throws on invalid client ID format', () => {
    process.env.GRAPH_TENANT_ID = '00000000-0000-0000-0000-000000000001';
    process.env.GRAPH_CLIENT_ID = 'invalid';
    process.env.GRAPH_CLIENT_SECRET = 'test-secret-12345';
    process.env.GRAPH_ORGANIZER_EMAIL = 'scheduling@test.com';

    expect(() => validateGraphConfig()).toThrow(GraphConfigError);
    expect(() => validateGraphConfig()).toThrow('Must be a valid UUID');
  });

  it('throws on short client secret', () => {
    process.env.GRAPH_TENANT_ID = '00000000-0000-0000-0000-000000000001';
    process.env.GRAPH_CLIENT_ID = '00000000-0000-0000-0000-000000000002';
    process.env.GRAPH_CLIENT_SECRET = 'short';
    process.env.GRAPH_ORGANIZER_EMAIL = 'scheduling@test.com';

    expect(() => validateGraphConfig()).toThrow(GraphConfigError);
    expect(() => validateGraphConfig()).toThrow('too short');
  });

  it('throws on invalid email format', () => {
    process.env.GRAPH_TENANT_ID = '00000000-0000-0000-0000-000000000001';
    process.env.GRAPH_CLIENT_ID = '00000000-0000-0000-0000-000000000002';
    process.env.GRAPH_CLIENT_SECRET = 'test-secret-12345';
    process.env.GRAPH_ORGANIZER_EMAIL = 'not-an-email';

    expect(() => validateGraphConfig()).toThrow(GraphConfigError);
    expect(() => validateGraphConfig()).toThrow('valid email');
  });

  it('throws on invalid max retries', () => {
    process.env.GRAPH_TENANT_ID = '00000000-0000-0000-0000-000000000001';
    process.env.GRAPH_CLIENT_ID = '00000000-0000-0000-0000-000000000002';
    process.env.GRAPH_CLIENT_SECRET = 'test-secret-12345';
    process.env.GRAPH_ORGANIZER_EMAIL = 'scheduling@test.com';
    process.env.GRAPH_MAX_RETRIES = '100';

    expect(() => validateGraphConfig()).toThrow(GraphConfigError);
    expect(() => validateGraphConfig()).toThrow('GRAPH_MAX_RETRIES');
  });

  it('throws on invalid retry delay', () => {
    process.env.GRAPH_TENANT_ID = '00000000-0000-0000-0000-000000000001';
    process.env.GRAPH_CLIENT_ID = '00000000-0000-0000-0000-000000000002';
    process.env.GRAPH_CLIENT_SECRET = 'test-secret-12345';
    process.env.GRAPH_ORGANIZER_EMAIL = 'scheduling@test.com';
    process.env.GRAPH_RETRY_DELAY_MS = '10';

    expect(() => validateGraphConfig()).toThrow(GraphConfigError);
    expect(() => validateGraphConfig()).toThrow('GRAPH_RETRY_DELAY_MS');
  });

  it('includes all validation errors in message', () => {
    // All fields missing/invalid
    process.env.GRAPH_TENANT_ID = 'bad';
    process.env.GRAPH_CLIENT_ID = 'bad';
    // CLIENT_SECRET missing
    process.env.GRAPH_ORGANIZER_EMAIL = 'bad';

    try {
      validateGraphConfig();
      fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(GraphConfigError);
      const message = (error as Error).message;
      expect(message).toContain('GRAPH_TENANT_ID');
      expect(message).toContain('GRAPH_CLIENT_ID');
      expect(message).toContain('GRAPH_CLIENT_SECRET');
      expect(message).toContain('GRAPH_ORGANIZER_EMAIL');
    }
  });
});

describe('isGraphModeReal', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns true when GRAPH_MODE=real', () => {
    process.env.GRAPH_MODE = 'real';
    expect(isGraphModeReal()).toBe(true);
  });

  it('returns false when GRAPH_MODE=mock', () => {
    process.env.GRAPH_MODE = 'mock';
    expect(isGraphModeReal()).toBe(false);
  });

  it('returns false when GRAPH_MODE is not set', () => {
    delete process.env.GRAPH_MODE;
    expect(isGraphModeReal()).toBe(false);
  });

  it('returns false for other values', () => {
    process.env.GRAPH_MODE = 'test';
    expect(isGraphModeReal()).toBe(false);
  });
});

describe('GraphConfigError', () => {
  it('has correct error name', () => {
    const error = new GraphConfigError('Test message');
    expect(error.name).toBe('GraphConfigError');
  });

  it('preserves message', () => {
    const error = new GraphConfigError('Configuration failed');
    expect(error.message).toBe('Configuration failed');
  });
});
