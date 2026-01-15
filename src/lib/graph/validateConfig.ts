/**
 * Graph Configuration Validation
 *
 * Validates required environment variables for GRAPH_MODE=real.
 * Throws clear errors on misconfiguration to fail fast at startup.
 */

export interface ValidatedGraphConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  organizerEmail: string;
  maxRetries: number;
  retryDelayMs: number;
}

interface ValidationError {
  field: string;
  message: string;
}

/**
 * Validate and return Graph configuration from environment variables.
 * Throws if validation fails.
 */
export function validateGraphConfig(): ValidatedGraphConfig {
  const errors: ValidationError[] = [];

  // Required fields
  const tenantId = process.env.GRAPH_TENANT_ID;
  const clientId = process.env.GRAPH_CLIENT_ID;
  const clientSecret = process.env.GRAPH_CLIENT_SECRET;
  const organizerEmail = process.env.GRAPH_ORGANIZER_EMAIL;

  // Optional fields with defaults
  const maxRetries = parseInt(process.env.GRAPH_MAX_RETRIES ?? '3', 10);
  const retryDelayMs = parseInt(process.env.GRAPH_RETRY_DELAY_MS ?? '1000', 10);

  // Validate tenant ID
  if (!tenantId) {
    errors.push({ field: 'GRAPH_TENANT_ID', message: 'Required environment variable is missing' });
  } else if (!isValidUuid(tenantId)) {
    errors.push({ field: 'GRAPH_TENANT_ID', message: 'Must be a valid UUID' });
  }

  // Validate client ID
  if (!clientId) {
    errors.push({ field: 'GRAPH_CLIENT_ID', message: 'Required environment variable is missing' });
  } else if (!isValidUuid(clientId)) {
    errors.push({ field: 'GRAPH_CLIENT_ID', message: 'Must be a valid UUID' });
  }

  // Validate client secret
  if (!clientSecret) {
    errors.push({ field: 'GRAPH_CLIENT_SECRET', message: 'Required environment variable is missing' });
  } else if (clientSecret.length < 10) {
    errors.push({ field: 'GRAPH_CLIENT_SECRET', message: 'Client secret appears too short' });
  }

  // Validate organizer email
  if (!organizerEmail) {
    errors.push({ field: 'GRAPH_ORGANIZER_EMAIL', message: 'Required environment variable is missing' });
  } else if (!isValidEmail(organizerEmail)) {
    errors.push({ field: 'GRAPH_ORGANIZER_EMAIL', message: 'Must be a valid email address' });
  }

  // Validate optional numeric fields
  if (isNaN(maxRetries) || maxRetries < 0 || maxRetries > 10) {
    errors.push({ field: 'GRAPH_MAX_RETRIES', message: 'Must be a number between 0 and 10' });
  }

  if (isNaN(retryDelayMs) || retryDelayMs < 100 || retryDelayMs > 60000) {
    errors.push({ field: 'GRAPH_RETRY_DELAY_MS', message: 'Must be a number between 100 and 60000' });
  }

  // Throw if any errors
  if (errors.length > 0) {
    const errorMessage = errors
      .map((e) => `  - ${e.field}: ${e.message}`)
      .join('\n');
    throw new GraphConfigError(
      `Graph configuration validation failed:\n${errorMessage}\n\nEnsure all required environment variables are set when GRAPH_MODE=real.`
    );
  }

  return {
    tenantId: tenantId!,
    clientId: clientId!,
    clientSecret: clientSecret!,
    organizerEmail: organizerEmail!,
    maxRetries,
    retryDelayMs,
  };
}

/**
 * Check if GRAPH_MODE=real is configured
 */
export function isGraphModeReal(): boolean {
  return process.env.GRAPH_MODE === 'real';
}

/**
 * Validate UUID format
 */
function isValidUuid(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

/**
 * Validate email format (basic check)
 */
function isValidEmail(value: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(value);
}

/**
 * Custom error for configuration issues
 */
export class GraphConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GraphConfigError';
  }
}
