/**
 * GraphTokenManager
 *
 * Manages OAuth 2.0 client credentials token acquisition and caching for Microsoft Graph API.
 *
 * Features:
 * - In-memory token caching with expiry tracking
 * - Single-flight locking to prevent thundering herd
 * - Early refresh window (5 minutes before expiry)
 * - Metrics tracking for ops dashboard
 */

export interface GraphTokenConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  tokenEndpoint?: string; // Override for testing
}

export interface GraphTokenMetrics {
  tokenRefreshes: number;
  tokenFailures: number;
  lastRefreshAt: Date | null;
  lastFailureAt: Date | null;
  lastError: string | null;
}

export class GraphTokenManager {
  private readonly config: GraphTokenConfig;
  private accessToken: string | null = null;
  private expiresAt: number = 0; // Unix timestamp ms
  private refreshPromise: Promise<string> | null = null;

  // 5 minutes early refresh window
  private readonly EARLY_REFRESH_MS = 300_000;

  // Metrics for ops dashboard
  private metrics: GraphTokenMetrics = {
    tokenRefreshes: 0,
    tokenFailures: 0,
    lastRefreshAt: null,
    lastFailureAt: null,
    lastError: null,
  };

  constructor(config: GraphTokenConfig) {
    this.config = config;
  }

  /**
   * Get a valid access token, refreshing if needed.
   * Uses single-flight locking to prevent thundering herd.
   */
  async getToken(): Promise<string> {
    const now = Date.now();

    // Return cached token if valid (with early refresh buffer)
    if (this.accessToken && this.expiresAt - this.EARLY_REFRESH_MS > now) {
      return this.accessToken;
    }

    // Single-flight: if refresh already in progress, wait for it
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    // Start refresh and store promise for concurrent callers
    this.refreshPromise = this.doRefresh();
    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  /**
   * Clear the cached token. Call this on 401 response.
   */
  clearToken(): void {
    this.accessToken = null;
    this.expiresAt = 0;
  }

  /**
   * Get current token status for ops dashboard
   */
  getTokenStatus(): {
    valid: boolean;
    expiresAt: Date | null;
    expiresInSeconds: number | null;
  } {
    const now = Date.now();
    const valid = this.accessToken !== null && this.expiresAt > now;
    return {
      valid,
      expiresAt: valid ? new Date(this.expiresAt) : null,
      expiresInSeconds: valid ? Math.floor((this.expiresAt - now) / 1000) : null,
    };
  }

  /**
   * Get metrics for ops dashboard
   */
  getMetrics(): GraphTokenMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics (for testing)
   */
  resetMetrics(): void {
    this.metrics = {
      tokenRefreshes: 0,
      tokenFailures: 0,
      lastRefreshAt: null,
      lastFailureAt: null,
      lastError: null,
    };
  }

  private getTokenEndpoint(): string {
    if (this.config.tokenEndpoint) {
      return this.config.tokenEndpoint;
    }
    return `https://login.microsoftonline.com/${this.config.tenantId}/oauth2/v2.0/token`;
  }

  private async doRefresh(): Promise<string> {
    const tokenEndpoint = this.getTokenEndpoint();

    try {
      const response = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          scope: 'https://graph.microsoft.com/.default',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        const errorMessage = `Token refresh failed: ${response.status} ${response.statusText} - ${errorText}`;
        this.recordFailure(errorMessage);
        throw new GraphTokenError(errorMessage, response.status);
      }

      const data = await response.json();
      const token: string = data.access_token;
      this.accessToken = token;
      this.expiresAt = Date.now() + data.expires_in * 1000;

      this.recordSuccess();
      return token;
    } catch (error) {
      if (error instanceof GraphTokenError) {
        throw error;
      }
      // Network error or other fetch failure
      const errorMessage = `Token refresh network error: ${error instanceof Error ? error.message : 'Unknown error'}`;
      this.recordFailure(errorMessage);
      throw new GraphTokenError(errorMessage, 0);
    }
  }

  private recordSuccess(): void {
    this.metrics.tokenRefreshes++;
    this.metrics.lastRefreshAt = new Date();
    this.metrics.lastError = null;
    console.log(`[Graph] Token refreshed successfully, expires in ${Math.floor((this.expiresAt - Date.now()) / 1000)}s`);
  }

  private recordFailure(error: string): void {
    this.metrics.tokenFailures++;
    this.metrics.lastFailureAt = new Date();
    this.metrics.lastError = error;
    console.error(`[Graph] Token refresh failed: ${error}`);
  }
}

/**
 * Custom error for token-related failures
 */
export class GraphTokenError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'GraphTokenError';
  }
}
