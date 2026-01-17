/**
 * Cron Authentication
 * Verifies requests are from authorized cron triggers
 */

import { NextRequest } from 'next/server';

/**
 * Verify that a request is from an authorized cron source
 * Supports:
 * - Vercel Cron signature (automatic in Vercel)
 * - Bearer token with CRON_SECRET
 */
export function verifyCronAuth(request: NextRequest): boolean {
  // Option 1: Vercel Cron header (trusted automatically in Vercel)
  const vercelCronHeader = request.headers.get('x-vercel-cron');
  if (vercelCronHeader === '1') {
    return true;
  }

  // Option 2: Bearer token for local development and manual triggers
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  // In development without CRON_SECRET, allow requests
  if (!cronSecret && process.env.NODE_ENV === 'development') {
    console.warn('[Cron] CRON_SECRET not set, allowing request in development');
    return true;
  }

  if (!cronSecret) {
    console.error('[Cron] CRON_SECRET not configured');
    return false;
  }

  if (!authHeader) {
    return false;
  }

  // Check Bearer token format
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    return token === cronSecret;
  }

  return false;
}

/**
 * Get a masked version of the auth header for logging
 */
export function getMaskedAuth(request: NextRequest): string {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return 'none';

  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    if (token.length > 8) {
      return `Bearer ${token.slice(0, 4)}...${token.slice(-4)}`;
    }
    return 'Bearer ***';
  }

  return '***';
}
