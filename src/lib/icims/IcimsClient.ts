/**
 * IcimsClient Interface
 *
 * Abstraction for iCIMS ATS API operations.
 * Allows swapping between mock and real implementations.
 */

import { IcimsApplication } from '@/types/scheduling';

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

/**
 * Factory function to get the appropriate client based on environment
 */
export function getIcimsClient(): IcimsClient {
  const mode = process.env.ICIMS_MODE || 'mock';

  if (mode === 'mock') {
    const { IcimsClientMock } = require('./IcimsClientMock');
    return new IcimsClientMock();
  }

  // TODO: Implement real iCIMS client
  throw new Error('Real iCIMS client not yet implemented. Set ICIMS_MODE=mock');
}
