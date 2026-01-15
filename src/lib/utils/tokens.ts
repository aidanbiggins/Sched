/**
 * Token Utilities for Public Scheduling Links
 *
 * Security model:
 * - Generate a random token (64 hex chars, 256 bits entropy)
 * - Hash the token with a pepper before storing
 * - Only store the hash in the database, never the raw token
 * - Never log raw tokens
 */

import { createHash, randomBytes } from 'crypto';

const TOKEN_HASH_PEPPER = process.env.TOKEN_HASH_PEPPER || 'dev-pepper-change-in-production';
const PUBLIC_LINK_TTL_DAYS = parseInt(process.env.PUBLIC_LINK_TTL_DAYS || '14', 10);

export interface TokenPair {
  token: string;      // Raw token to send to user (never store)
  tokenHash: string;  // Hashed token to store in DB
}

/**
 * Generate a new public token and its hash
 * Returns both the raw token (for the URL) and the hash (for storage)
 */
export function generatePublicToken(): TokenPair {
  // Generate 32 random bytes (256 bits of entropy)
  const bytes = randomBytes(32);
  const token = bytes.toString('hex'); // 64 character hex string

  // Hash the token with pepper for storage
  const tokenHash = hashToken(token);

  return { token, tokenHash };
}

/**
 * Hash a token using SHA-256 with the pepper
 * Use this to look up tokens in the database
 */
export function hashToken(token: string): string {
  return createHash('sha256')
    .update(TOKEN_HASH_PEPPER)
    .update(token)
    .digest('hex');
}

/**
 * Calculate expiry date based on TTL configuration
 */
export function calculateTokenExpiry(createdAt: Date = new Date()): Date {
  const expiresAt = new Date(createdAt);
  expiresAt.setDate(expiresAt.getDate() + PUBLIC_LINK_TTL_DAYS);
  return expiresAt;
}

/**
 * Check if a token has expired
 */
export function isTokenExpired(expiresAt: Date): boolean {
  return new Date() > expiresAt;
}

/**
 * Get the TTL in days (for testing/display)
 */
export function getTokenTtlDays(): number {
  return PUBLIC_LINK_TTL_DAYS;
}
