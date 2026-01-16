/**
 * iCIMS Configuration
 *
 * Validates and provides iCIMS configuration.
 * Supports API Key auth (primary) with OAuth as future extension.
 */

export interface IcimsConfig {
  mode: 'mock' | 'real';
  baseUrl: string;
  apiKey: string;
}

export interface IcimsConfigValidationResult {
  valid: boolean;
  config: IcimsConfig | null;
  errors: string[];
}

/**
 * Validate iCIMS configuration from environment variables
 */
export function validateIcimsConfig(): IcimsConfigValidationResult {
  const mode = (process.env.ICIMS_MODE || 'mock') as 'mock' | 'real';

  // Mock mode requires no additional config
  if (mode === 'mock') {
    return {
      valid: true,
      config: {
        mode: 'mock',
        baseUrl: '',
        apiKey: '',
      },
      errors: [],
    };
  }

  // Real mode requires baseUrl and apiKey
  const errors: string[] = [];

  const baseUrl = process.env.ICIMS_BASE_URL;
  if (!baseUrl) {
    errors.push('ICIMS_BASE_URL is required when ICIMS_MODE=real');
  } else if (!isValidUrl(baseUrl)) {
    errors.push('ICIMS_BASE_URL must be a valid URL');
  }

  const apiKey = process.env.ICIMS_API_KEY;
  if (!apiKey) {
    errors.push('ICIMS_API_KEY is required when ICIMS_MODE=real');
  } else if (apiKey.length < 10) {
    errors.push('ICIMS_API_KEY appears to be invalid (too short)');
  }

  if (errors.length > 0) {
    return {
      valid: false,
      config: null,
      errors,
    };
  }

  return {
    valid: true,
    config: {
      mode: 'real',
      baseUrl: normalizeBaseUrl(baseUrl!),
      apiKey: apiKey!,
    },
    errors: [],
  };
}

/**
 * Get validated iCIMS config or throw if invalid
 */
export function getIcimsConfig(): IcimsConfig {
  const result = validateIcimsConfig();
  if (!result.valid) {
    throw new Error(`iCIMS configuration invalid: ${result.errors.join(', ')}`);
  }
  return result.config!;
}

/**
 * Check if iCIMS is in real mode
 */
export function isIcimsRealMode(): boolean {
  return process.env.ICIMS_MODE === 'real';
}

/**
 * Validate URL format
 */
function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Normalize base URL (remove trailing slash)
 */
function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * Get config summary for ops/logging (no secrets)
 */
export function getIcimsConfigSummary(): {
  mode: string;
  baseUrl: string;
  hasApiKey: boolean;
} {
  const mode = process.env.ICIMS_MODE || 'mock';
  return {
    mode,
    baseUrl: process.env.ICIMS_BASE_URL || '',
    hasApiKey: !!process.env.ICIMS_API_KEY,
  };
}
