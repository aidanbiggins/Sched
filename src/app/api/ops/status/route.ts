/**
 * Environment Status API
 *
 * Returns safe environment configuration values for display in the hub.
 */

import { NextResponse } from 'next/server';

export interface EnvStatus {
  graph: {
    mode: 'live' | 'mock' | 'unknown';
    configured: boolean;
  };
  icims: {
    mode: 'live' | 'mock' | 'disabled';
    configured: boolean;
  };
  email: {
    mode: 'live' | 'mock' | 'disabled';
  };
  database: {
    type: 'supabase' | 'memory';
    configured: boolean;
  };
  auth: {
    google: boolean;
    microsoft: boolean;
  };
  environment: 'development' | 'production' | 'test';
}

export async function GET() {
  const status: EnvStatus = {
    graph: {
      mode: getGraphMode(),
      configured: Boolean(
        process.env.AZURE_AD_CLIENT_ID && process.env.AZURE_AD_CLIENT_SECRET
      ),
    },
    icims: {
      mode: getIcimsMode(),
      configured: Boolean(process.env.ICIMS_API_URL && process.env.ICIMS_API_KEY),
    },
    email: {
      mode: getEmailMode(),
    },
    database: {
      type: process.env.DATABASE_URL || process.env.SUPABASE_URL ? 'supabase' : 'memory',
      configured: Boolean(process.env.DATABASE_URL || process.env.SUPABASE_URL),
    },
    auth: {
      google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      microsoft: Boolean(
        process.env.AZURE_AD_CLIENT_ID &&
          process.env.AZURE_AD_CLIENT_SECRET &&
          process.env.AZURE_AD_TENANT_ID
      ),
    },
    environment: getEnvironment(),
  };

  return NextResponse.json(status);
}

function getGraphMode(): 'live' | 'mock' | 'unknown' {
  const mode = process.env.GRAPH_MODE?.toLowerCase();
  if (mode === 'live') return 'live';
  if (mode === 'mock') return 'mock';
  // Default to mock in development, unknown otherwise
  if (process.env.NODE_ENV === 'development') return 'mock';
  return 'unknown';
}

function getIcimsMode(): 'live' | 'mock' | 'disabled' {
  const mode = process.env.ICIMS_MODE?.toLowerCase();
  if (mode === 'live') return 'live';
  if (mode === 'mock') return 'mock';
  if (mode === 'disabled') return 'disabled';
  // Default based on configuration
  if (process.env.ICIMS_API_URL && process.env.ICIMS_API_KEY) return 'live';
  return 'disabled';
}

function getEmailMode(): 'live' | 'mock' | 'disabled' {
  const mode = process.env.EMAIL_MODE?.toLowerCase();
  if (mode === 'live') return 'live';
  if (mode === 'mock') return 'mock';
  return 'disabled';
}

function getEnvironment(): 'development' | 'production' | 'test' {
  const env = process.env.NODE_ENV;
  if (env === 'production') return 'production';
  if (env === 'test') return 'test';
  return 'development';
}
