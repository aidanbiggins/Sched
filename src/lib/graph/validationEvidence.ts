/**
 * Graph Validation Evidence Storage
 *
 * In-memory storage for the last Graph API validation run.
 * This provides evidence of scoping configuration for production readiness.
 */

import type { GraphValidationEvidence } from '@/types/scheduling';

// In-memory storage for validation evidence (last run)
let lastValidationEvidence: GraphValidationEvidence | null = null;

export function setLastValidationEvidence(evidence: GraphValidationEvidence): void {
  lastValidationEvidence = evidence;
}

export function getLastValidationEvidence(): GraphValidationEvidence | null {
  return lastValidationEvidence;
}
