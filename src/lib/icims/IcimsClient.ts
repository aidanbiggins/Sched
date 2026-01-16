/**
 * IcimsClient Interface
 *
 * Abstraction for iCIMS ATS API operations.
 * Allows swapping between mock and real implementations.
 */

import { IcimsApplication } from '@/types/scheduling';
import { getIcimsConfig, isIcimsRealMode } from './icimsConfig';

export interface IcimsClient {
  /**
   * Get application details from iCIMS
   */
  getApplication(applicationId: string): Promise<IcimsApplication>;

  /**
   * Add a note to an application in iCIMS
   */
  addApplicationNote(applicationId: string, noteText: string): Promise<void>;
}

// Singleton client instance
let clientInstance: IcimsClient | null = null;

/**
 * Factory function to get the appropriate client based on environment
 */
export function getIcimsClient(): IcimsClient {
  if (clientInstance) {
    return clientInstance;
  }

  const mode = process.env.ICIMS_MODE || 'mock';

  let client: IcimsClient;

  if (mode === 'mock') {
    const { IcimsClientMock } = require('./IcimsClientMock');
    client = new IcimsClientMock();
  } else if (mode === 'real') {
    // Validate config before creating real client
    const config = getIcimsConfig();
    const { IcimsClientReal } = require('./IcimsClientReal');
    client = new IcimsClientReal(config);
  } else {
    throw new Error(`Invalid ICIMS_MODE: ${mode}. Must be 'mock' or 'real'.`);
  }

  clientInstance = client;
  return client;
}

/**
 * Reset client instance (for testing)
 */
export function resetIcimsClient(): void {
  clientInstance = null;
}
