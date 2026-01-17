/**
 * Application Configuration
 *
 * Centralized config for feature flags and mode settings.
 */

export type AppMode = 'standalone' | 'enterprise';

export interface AppConfig {
  /**
   * Application mode:
   * - 'standalone': Personal calendar scheduling without ATS integration
   * - 'enterprise': Full integration with iCIMS ATS
   */
  mode: AppMode;

  /**
   * Whether ATS (iCIMS) integration is enabled
   */
  atsEnabled: boolean;

  /**
   * Whether to sync events back to ATS
   */
  atsSyncEnabled: boolean;

  /**
   * Whether webhooks from ATS are enabled
   */
  atsWebhooksEnabled: boolean;

  /**
   * Database mode
   */
  dbMode: 'memory' | 'supabase';

  /**
   * Whether email notifications are enabled
   */
  emailEnabled: boolean;
}

/**
 * Get application configuration from environment
 */
export function getAppConfig(): AppConfig {
  const mode = (process.env.APP_MODE as AppMode) || 'standalone';
  const isEnterprise = mode === 'enterprise';

  return {
    mode,
    atsEnabled: isEnterprise && !!process.env.ICIMS_CUSTOMER_ID,
    atsSyncEnabled: isEnterprise && process.env.ATS_SYNC_ENABLED !== 'false',
    atsWebhooksEnabled: isEnterprise && process.env.ATS_WEBHOOKS_ENABLED !== 'false',
    dbMode: (process.env.DB_MODE as 'memory' | 'supabase') || 'memory',
    emailEnabled: process.env.EMAIL_ENABLED !== 'false',
  };
}

/**
 * Check if running in standalone mode (no ATS)
 */
export function isStandaloneMode(): boolean {
  return getAppConfig().mode === 'standalone';
}

/**
 * Check if ATS integration is enabled
 */
export function isAtsEnabled(): boolean {
  return getAppConfig().atsEnabled;
}

/**
 * Check if email notifications are enabled
 */
export function isEmailEnabled(): boolean {
  return getAppConfig().emailEnabled;
}
