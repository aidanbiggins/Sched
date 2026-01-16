'use client';

import { useSession, signIn, signOut } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface CalendarConnection {
  id: string;
  provider: 'google' | 'microsoft';
  email: string;
  isPrimary: boolean;
  status: 'active' | 'expired' | 'revoked';
  createdAt: string;
}

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [connections, setConnections] = useState<CalendarConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/signin');
    }
  }, [status, router]);

  useEffect(() => {
    if (session?.user) {
      fetchConnections();
    }
  }, [session]);

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

  const disconnectCalendar = async (connectionId: string) => {
    if (!confirm('Are you sure you want to disconnect this calendar?')) return;

    setDisconnecting(connectionId);
    try {
      const res = await fetch('/api/calendar/connections', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId }),
      });

      if (res.ok) {
        setConnections((prev) => prev.filter((c) => c.id !== connectionId));
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to disconnect');
      }
    } catch (error) {
      alert('Failed to disconnect calendar');
    } finally {
      setDisconnecting(null);
    }
  };

  const getProviderIcon = (provider: string) => {
    if (provider === 'google') {
      return (
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
      );
    }
    return (
      <svg className="w-5 h-5" viewBox="0 0 23 23">
        <path fill="#f35325" d="M1 1h10v10H1z"/>
        <path fill="#81bc06" d="M12 1h10v10H12z"/>
        <path fill="#05a6f0" d="M1 12h10v10H1z"/>
        <path fill="#ffba08" d="M12 12h10v10H12z"/>
      </svg>
    );
  };

  const getStatusBadge = (status: string) => {
    const colors = {
      active: 'bg-green-500/20 text-green-400 border-green-500/30',
      expired: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      revoked: 'bg-red-500/20 text-red-400 border-red-500/30',
    };
    return colors[status as keyof typeof colors] || colors.expired;
  };

  const hasGoogle = connections.some((c) => c.provider === 'google');
  const hasMicrosoft = connections.some((c) => c.provider === 'microsoft');

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-100">Settings</h1>
            <p className="text-zinc-400 text-sm mt-1">Manage your account and calendar connections</p>
          </div>
          <button
            onClick={() => router.push('/coordinator')}
            className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Back to Dashboard
          </button>
        </div>

        {/* Account Section */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
          <h2 className="text-lg font-medium text-zinc-100 mb-4">Account</h2>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {session?.user?.image && (
                <img
                  src={session.user.image}
                  alt=""
                  className="w-12 h-12 rounded-full"
                />
              )}
              <div>
                <p className="text-zinc-100 font-medium">{session?.user?.name}</p>
                <p className="text-zinc-400 text-sm">{session?.user?.email}</p>
              </div>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: '/signin' })}
              className="px-4 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>

        {/* Calendar Connections Section */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h2 className="text-lg font-medium text-zinc-100 mb-4">Calendar Connections</h2>
          <p className="text-zinc-400 text-sm mb-6">
            Connect your calendars to enable interview scheduling. Your calendar is used to check
            availability and create meeting invites.
          </p>

          {/* Connected Calendars */}
          {connections.length > 0 && (
            <div className="space-y-3 mb-6">
              {connections.map((connection) => (
                <div
                  key={connection.id}
                  className="flex items-center justify-between p-4 bg-zinc-800/50 rounded-lg border border-zinc-700/50"
                >
                  <div className="flex items-center gap-3">
                    {getProviderIcon(connection.provider)}
                    <div>
                      <p className="text-zinc-100 text-sm font-medium">{connection.email}</p>
                      <p className="text-zinc-500 text-xs capitalize">
                        {connection.provider === 'google' ? 'Google Calendar' : 'Microsoft Outlook'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-2 py-0.5 text-xs rounded-full border ${getStatusBadge(
                        connection.status
                      )}`}
                    >
                      {connection.status}
                    </span>
                    <button
                      onClick={() => disconnectCalendar(connection.id)}
                      disabled={disconnecting === connection.id}
                      className="px-3 py-1.5 text-xs text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {disconnecting === connection.id ? 'Disconnecting...' : 'Disconnect'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add Calendar Buttons */}
          <div className="space-y-3">
            <p className="text-zinc-500 text-xs uppercase tracking-wide">Add Calendar</p>
            <div className="flex gap-3">
              {!hasGoogle && (
                <button
                  onClick={() => signIn('google', { callbackUrl: '/settings' })}
                  className="flex items-center gap-2 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  <span className="text-sm text-zinc-200">Connect Google</span>
                </button>
              )}
              {!hasMicrosoft && (
                <button
                  onClick={() => signIn('azure-ad', { callbackUrl: '/settings' })}
                  className="flex items-center gap-2 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" viewBox="0 0 23 23">
                    <path fill="#f35325" d="M1 1h10v10H1z"/>
                    <path fill="#81bc06" d="M12 1h10v10H12z"/>
                    <path fill="#05a6f0" d="M1 12h10v10H1z"/>
                    <path fill="#ffba08" d="M12 12h10v10H12z"/>
                  </svg>
                  <span className="text-sm text-zinc-200">Connect Microsoft</span>
                </button>
              )}
            </div>
            {hasGoogle && hasMicrosoft && (
              <p className="text-zinc-500 text-sm">All calendar providers are connected.</p>
            )}
          </div>
        </div>

        {/* App Mode Info */}
        <div className="mt-6 p-4 bg-zinc-900/50 border border-zinc-800/50 rounded-lg">
          <p className="text-zinc-500 text-xs">
            Running in <span className="text-zinc-400 font-medium">Standalone Mode</span> -
            Your personal calendar is used for scheduling. No ATS integration.
          </p>
        </div>
      </div>
    </div>
  );
}
