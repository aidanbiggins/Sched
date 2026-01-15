/**
 * IcimsClientMock
 *
 * Mock implementation of IcimsClient for local development and testing.
 * Logs notes to the audit log instead of making real API calls.
 */

import { v4 as uuidv4 } from 'uuid';
import { IcimsClient } from './IcimsClient';
import { IcimsApplication, AuditLog } from '@/types/scheduling';
import { createAuditLog } from '@/lib/db';

// ============================================
// Default Fixture Data
// ============================================

const MOCK_APPLICATIONS: Record<string, IcimsApplication> = {
  'APP-001': {
    id: 'APP-001',
    candidateName: 'John Smith',
    candidateEmail: 'john.smith@example.com',
    requisitionId: 'REQ-123',
    requisitionTitle: 'Senior Software Engineer',
    status: 'Interview',
  },
  'APP-002': {
    id: 'APP-002',
    candidateName: 'Jane Doe',
    candidateEmail: 'jane.doe@example.com',
    requisitionId: 'REQ-456',
    requisitionTitle: 'Product Manager',
    status: 'Interview',
  },
  'APP-003': {
    id: 'APP-003',
    candidateName: 'Bob Johnson',
    candidateEmail: 'bob.johnson@example.com',
    requisitionId: 'REQ-789',
    requisitionTitle: 'UX Designer',
    status: 'Interview',
  },
};

// Store notes for retrieval in tests
const applicationNotes: Map<string, string[]> = new Map();

export class IcimsClientMock implements IcimsClient {
  private fixtureOverrides: Record<string, IcimsApplication> = {};
  private failOnNextRequest: boolean = false;

  /**
   * Set fixture overrides for testing
   */
  setFixtureOverrides(overrides: Record<string, IcimsApplication>): void {
    this.fixtureOverrides = overrides;
  }

  /**
   * Configure the mock to fail on the next request (for testing error handling)
   */
  setFailOnNextRequest(fail: boolean): void {
    this.failOnNextRequest = fail;
  }

  /**
   * Get application details from iCIMS
   */
  async getApplication(applicationId: string): Promise<IcimsApplication> {
    // Check overrides first
    const override = this.fixtureOverrides[applicationId];
    if (override) {
      return override;
    }

    // Check mock data
    const mockApp = MOCK_APPLICATIONS[applicationId];
    if (mockApp) {
      return mockApp;
    }

    // Return a generated application for unknown IDs
    return {
      id: applicationId,
      candidateName: `Candidate ${applicationId}`,
      candidateEmail: `candidate-${applicationId.toLowerCase()}@example.com`,
      requisitionId: `REQ-${applicationId}`,
      requisitionTitle: 'Unknown Position',
      status: 'Interview',
    };
  }

  /**
   * Add a note to an application in iCIMS
   */
  async addApplicationNote(applicationId: string, noteText: string): Promise<void> {
    // Check if we should fail this request (for testing)
    if (this.failOnNextRequest) {
      this.failOnNextRequest = false; // Reset after use
      throw new Error('iCIMS API error: Connection refused (mock failure)');
    }

    // Store the note
    const existingNotes = applicationNotes.get(applicationId) || [];
    existingNotes.push(noteText);
    applicationNotes.set(applicationId, existingNotes);

    // Log to audit log
    const log: AuditLog = {
      id: uuidv4(),
      requestId: null,
      bookingId: null,
      action: 'icims_note',
      actorType: 'system',
      actorId: null,
      payload: {
        applicationId,
        noteText,
        mock: true,
      },
      createdAt: new Date(),
    };

    await createAuditLog(log);

    // Log to console in development
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[iCIMS Mock] Note added to ${applicationId}:`, noteText);
    }
  }

  /**
   * Get all notes for an application (for testing)
   */
  getApplicationNotes(applicationId: string): string[] {
    return applicationNotes.get(applicationId) || [];
  }

  /**
   * Clear all notes (for testing)
   */
  clearNotes(): void {
    applicationNotes.clear();
  }
}

/**
 * Get all mock applications (for testing/development)
 */
export function getMockApplications(): IcimsApplication[] {
  return Object.values(MOCK_APPLICATIONS);
}
