/**
 * IcimsClientReal
 *
 * Real implementation of IcimsClient for production use.
 * Makes actual API calls to iCIMS with retry logic and metrics.
 */

import { IcimsClient } from './IcimsClient';
import { IcimsApplication } from '@/types/scheduling';
import { IcimsConfig } from './icimsConfig';
import { icimsRequest, generateIdempotencyKey } from './icimsHttp';
import { IcimsNotFoundError } from './icimsErrors';

// API response shapes (expected from iCIMS)
interface IcimsApiApplication {
  id: string;
  candidate?: {
    name?: string;
    email?: string;
  };
  candidateName?: string;
  candidateEmail?: string;
  requisition?: {
    id?: string;
    title?: string;
  };
  requisitionId?: string;
  requisitionTitle?: string;
  status?: string;
}

interface IcimsApiNoteResponse {
  id: string;
  content: string;
  createdAt: string;
}

export class IcimsClientReal implements IcimsClient {
  private config: IcimsConfig;

  constructor(config: IcimsConfig) {
    this.config = config;
  }

  /**
   * Get application details from iCIMS
   */
  async getApplication(applicationId: string): Promise<IcimsApplication> {
    try {
      const response = await icimsRequest<IcimsApiApplication>(this.config, {
        method: 'GET',
        path: `/api/v1/applications/${applicationId}`,
      });

      return this.mapApplication(response.data, applicationId);
    } catch (error) {
      // Enhance not found error with context
      if (error instanceof IcimsNotFoundError) {
        throw new IcimsNotFoundError('application', applicationId);
      }
      throw error;
    }
  }

  /**
   * Add a note to an application in iCIMS
   */
  async addApplicationNote(applicationId: string, noteText: string): Promise<void> {
    const idempotencyKey = generateIdempotencyKey(applicationId, noteText);

    await icimsRequest<IcimsApiNoteResponse>(this.config, {
      method: 'POST',
      path: `/api/v1/applications/${applicationId}/notes`,
      body: {
        content: noteText,
        noteType: 'scheduling',
      },
      idempotencyKey,
    });

    // Log success (safe - no PII)
    console.log(`[iCIMS] Note added to application ${applicationId}`);
  }

  /**
   * Map iCIMS API response to our application model
   * Handles different response formats flexibly
   */
  private mapApplication(data: IcimsApiApplication, applicationId: string): IcimsApplication {
    // iCIMS API responses can vary in structure
    // Handle both nested and flat formats
    return {
      id: data.id || applicationId,
      candidateName:
        data.candidate?.name || data.candidateName || `Candidate ${applicationId}`,
      candidateEmail:
        data.candidate?.email ||
        data.candidateEmail ||
        `candidate-${applicationId.toLowerCase()}@unknown.com`,
      requisitionId:
        data.requisition?.id || data.requisitionId || `REQ-${applicationId}`,
      requisitionTitle:
        data.requisition?.title || data.requisitionTitle || 'Unknown Position',
      status: data.status || 'Unknown',
    };
  }
}
