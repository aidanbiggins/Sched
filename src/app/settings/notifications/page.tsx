'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface NotificationPreferences {
  notifyOnBooking: boolean;
  notifyOnCancel: boolean;
  notifyOnEscalation: boolean;
  digestFrequency: 'immediate' | 'daily' | 'weekly';
}

export default function NotificationsSettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    notifyOnBooking: true,
    notifyOnCancel: true,
    notifyOnEscalation: true,
    digestFrequency: 'immediate',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/signin');
    }
  }, [status, router]);

  useEffect(() => {
    if (session?.user) {
      fetchPreferences();
    }
  }, [session]);

  const fetchPreferences = async () => {
    try {
      const res = await fetch('/api/coordinator/preferences');
      const data = await res.json();
      if (data.preferences) {
        setPreferences(data.preferences);
      }
    } catch (error) {
      console.error('Failed to fetch preferences:', error);
    } finally {
      setLoading(false);
    }
  };

  const savePreferences = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch('/api/coordinator/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(preferences),
      });

      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to save preferences');
      }
    } catch (error) {
      alert('Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  const updatePreference = (key: keyof NotificationPreferences, value: boolean | string) => {
    setPreferences((prev) => ({ ...prev, [key]: value }));
  };

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
          <div className="flex items-center gap-4">
            <Link
              href="/settings"
              className="text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-2xl font-semibold text-zinc-100">Notification Settings</h1>
              <p className="text-zinc-400 text-sm mt-1">Control when you receive email notifications</p>
            </div>
          </div>
        </div>

        {/* Notification Toggles */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
          <h2 className="text-lg font-medium text-zinc-100 mb-4">Email Notifications</h2>
          <p className="text-zinc-400 text-sm mb-6">
            Choose which events trigger email notifications for you.
          </p>

          <div className="space-y-4">
            {/* Booking Notifications */}
            <div className="flex items-center justify-between p-4 bg-zinc-800/50 rounded-lg border border-zinc-700/50">
              <div>
                <p className="text-zinc-100 font-medium">Interview Bookings</p>
                <p className="text-zinc-400 text-sm">Get notified when a candidate books an interview</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={preferences.notifyOnBooking}
                  onChange={(e) => updatePreference('notifyOnBooking', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#1a5f5f]/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#1a5f5f]"></div>
              </label>
            </div>

            {/* Cancel Notifications */}
            <div className="flex items-center justify-between p-4 bg-zinc-800/50 rounded-lg border border-zinc-700/50">
              <div>
                <p className="text-zinc-100 font-medium">Cancellations</p>
                <p className="text-zinc-400 text-sm">Get notified when a candidate cancels their interview</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={preferences.notifyOnCancel}
                  onChange={(e) => updatePreference('notifyOnCancel', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#1a5f5f]/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#1a5f5f]"></div>
              </label>
            </div>

            {/* Escalation Notifications */}
            <div className="flex items-center justify-between p-4 bg-zinc-800/50 rounded-lg border border-zinc-700/50">
              <div>
                <p className="text-zinc-100 font-medium">Escalations</p>
                <p className="text-zinc-400 text-sm">Get notified when a candidate hasn&apos;t responded for several days</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={preferences.notifyOnEscalation}
                  onChange={(e) => updatePreference('notifyOnEscalation', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#1a5f5f]/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#1a5f5f]"></div>
              </label>
            </div>
          </div>
        </div>

        {/* Digest Frequency */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
          <h2 className="text-lg font-medium text-zinc-100 mb-4">Notification Frequency</h2>
          <p className="text-zinc-400 text-sm mb-6">
            Choose how often you want to receive notification emails.
          </p>

          <div className="space-y-3">
            <label className="flex items-center p-4 bg-zinc-800/50 rounded-lg border border-zinc-700/50 cursor-pointer hover:bg-zinc-800/70 transition-colors">
              <input
                type="radio"
                name="digestFrequency"
                value="immediate"
                checked={preferences.digestFrequency === 'immediate'}
                onChange={(e) => updatePreference('digestFrequency', e.target.value)}
                className="w-4 h-4 text-[#1a5f5f] bg-zinc-700 border-zinc-600 focus:ring-[#1a5f5f]/50"
              />
              <div className="ml-3">
                <p className="text-zinc-100 font-medium">Immediate</p>
                <p className="text-zinc-400 text-sm">Get notified as soon as events happen</p>
              </div>
            </label>

            <label className="flex items-center p-4 bg-zinc-800/50 rounded-lg border border-zinc-700/50 cursor-pointer hover:bg-zinc-800/70 transition-colors">
              <input
                type="radio"
                name="digestFrequency"
                value="daily"
                checked={preferences.digestFrequency === 'daily'}
                onChange={(e) => updatePreference('digestFrequency', e.target.value)}
                className="w-4 h-4 text-[#1a5f5f] bg-zinc-700 border-zinc-600 focus:ring-[#1a5f5f]/50"
              />
              <div className="ml-3">
                <p className="text-zinc-100 font-medium">Daily Digest</p>
                <p className="text-zinc-400 text-sm">Receive a summary email once per day</p>
              </div>
            </label>

            <label className="flex items-center p-4 bg-zinc-800/50 rounded-lg border border-zinc-700/50 cursor-pointer hover:bg-zinc-800/70 transition-colors">
              <input
                type="radio"
                name="digestFrequency"
                value="weekly"
                checked={preferences.digestFrequency === 'weekly'}
                onChange={(e) => updatePreference('digestFrequency', e.target.value)}
                className="w-4 h-4 text-[#1a5f5f] bg-zinc-700 border-zinc-600 focus:ring-[#1a5f5f]/50"
              />
              <div className="ml-3">
                <p className="text-zinc-100 font-medium">Weekly Digest</p>
                <p className="text-zinc-400 text-sm">Receive a summary email once per week</p>
              </div>
            </label>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex items-center justify-between">
          <div>
            {saved && (
              <p className="text-green-400 text-sm flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Preferences saved
              </p>
            )}
          </div>
          <button
            onClick={savePreferences}
            disabled={saving}
            className="px-6 py-2.5 bg-[#1a5f5f] hover:bg-[#164d4d] text-white font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Preferences'}
          </button>
        </div>
      </div>
    </div>
  );
}
