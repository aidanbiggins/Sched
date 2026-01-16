/**
 * ConnectCalendarStep - Calendar connection verification
 *
 * Shows connected calendar or prompts to connect one.
 */

'use client';

import { useEffect, useState } from 'react';
import { signIn } from 'next-auth/react';

interface CalendarConnection {
  id: string;
  provider: 'google' | 'microsoft';
  email: string;
  status: 'active' | 'expired' | 'revoked';
}

export interface ConnectCalendarStepProps {
  onNext: () => void;
  onBack: () => void;
}

export function ConnectCalendarStep({ onNext, onBack }: ConnectCalendarStepProps) {
  const [connections, setConnections] = useState<CalendarConnection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchConnections();
  }, []);

  const fetchConnections = async () => {
    try {
      const res = await fetch('/api/calendar/connections');
      const data = await res.json();
      if (data.connections) {
        setConnections(data.connections);
      }
    } catch (error) {
      console.error('Failed to fetch connections:', error);
    } finally {
      setLoading(false);
    }
  };

  const activeConnection = connections.find((c) => c.status === 'active');

  const getProviderIcon = (provider: string) => {
    if (provider === 'google') {
      return (
        <svg className="w-6 h-6" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
      );
    }
    return (
      <svg className="w-6 h-6" viewBox="0 0 23 23">
        <path fill="#f35325" d="M1 1h10v10H1z"/>
        <path fill="#81bc06" d="M12 1h10v10H12z"/>
        <path fill="#05a6f0" d="M1 12h10v10H1z"/>
        <path fill="#ffba08" d="M12 12h10v10H12z"/>
      </svg>
    );
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin w-8 h-8 border-2 border-[#1a5f5f] border-t-transparent rounded-full mx-auto" />
        <p className="text-gray-500 mt-4">Checking calendar connection...</p>
      </div>
    );
  }

  return (
    <div className="text-center px-4 max-w-md mx-auto">
      {/* Calendar icon */}
      <div className="w-16 h-16 bg-[#1a5f5f]/10 rounded-full flex items-center justify-center mx-auto mb-6">
        <svg className="w-8 h-8 text-[#1a5f5f]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      </div>

      <h2 className="text-xl font-bold text-gray-900 mb-2">Calendar Connection</h2>
      <p className="text-gray-600 mb-6">
        Your calendar is used to check availability and create meeting invites.
      </p>

      {activeConnection ? (
        /* Connected state */
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-center gap-3 mb-2">
            <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <span className="font-medium text-green-800">Calendar Connected</span>
          </div>
          <div className="flex items-center justify-center gap-2 text-sm text-green-700">
            {getProviderIcon(activeConnection.provider)}
            <span>{activeConnection.email}</span>
          </div>
        </div>
      ) : (
        /* Not connected state */
        <div className="space-y-3 mb-6">
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
            No calendar connected. Connect one to enable scheduling.
          </p>
          <button
            onClick={() => signIn('google', { callbackUrl: '/onboarding/wizard' })}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <span className="font-medium text-gray-700">Connect Google Calendar</span>
          </button>
          <button
            onClick={() => signIn('azure-ad', { callbackUrl: '/onboarding/wizard' })}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 23 23">
              <path fill="#f35325" d="M1 1h10v10H1z"/>
              <path fill="#81bc06" d="M12 1h10v10H12z"/>
              <path fill="#05a6f0" d="M1 12h10v10H1z"/>
              <path fill="#ffba08" d="M12 12h10v10H12z"/>
            </svg>
            <span className="font-medium text-gray-700">Connect Microsoft Outlook</span>
          </button>
        </div>
      )}

      {/* Navigation */}
      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 px-4 py-2.5 text-gray-700 font-medium rounded-lg hover:bg-gray-100 transition-colors"
        >
          Back
        </button>
        <button
          onClick={onNext}
          disabled={!activeConnection}
          className="flex-1 px-4 py-2.5 bg-[#1a5f5f] text-white font-medium rounded-lg hover:bg-[#154d4d] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {activeConnection ? 'Continue' : 'Skip for Now'}
        </button>
      </div>
    </div>
  );
}

export default ConnectCalendarStep;
