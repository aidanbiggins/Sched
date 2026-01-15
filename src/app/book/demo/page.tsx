'use client';

import { useState, useEffect } from 'react';

const COMMON_TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Phoenix', label: 'Arizona (MST)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HST)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Paris (CET/CEST)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Asia/Shanghai', label: 'Shanghai (CST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST/AEDT)' },
];

interface Slot {
  slotId: string;
  start: string;
  end: string;
}

type Step = 'select' | 'confirm' | 'confirmed';

function generateMockSlots(): Slot[] {
  const slots: Slot[] = [];
  const now = new Date();
  for (let day = 1; day <= 5; day++) {
    const date = new Date(now);
    date.setDate(date.getDate() + day);
    const times = [9, 10, 11, 14, 15, 16];
    const numSlots = 3 + Math.floor(Math.random() * 3);
    const selectedTimes = times.sort(() => Math.random() - 0.5).slice(0, numSlots);
    for (const hour of selectedTimes.sort((a, b) => a - b)) {
      const start = new Date(date);
      start.setHours(hour, 0, 0, 0);
      const end = new Date(start);
      end.setHours(hour + 1);
      slots.push({
        slotId: `slot-${day}-${hour}`,
        start: start.toISOString(),
        end: end.toISOString(),
      });
    }
  }
  return slots;
}

function groupSlotsByDate(slots: Slot[], timezone: string): Record<string, Slot[]> {
  const grouped: Record<string, Slot[]> = {};
  for (const slot of slots) {
    const startDate = new Date(slot.start);
    const dateStr = startDate.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      timeZone: timezone,
    });
    if (!grouped[dateStr]) grouped[dateStr] = [];
    grouped[dateStr].push(slot);
  }
  return grouped;
}

function formatSlotTime(slot: Slot, timezone: string): string {
  const startDate = new Date(slot.start);
  return startDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
  });
}

export default function DemoBookingPage() {
  const [slots] = useState<Slot[]>(() => generateMockSlots());
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [booking, setBooking] = useState(false);
  const [step, setStep] = useState<Step>('select');
  const [timezone, setTimezone] = useState<string>('America/New_York');

  useEffect(() => {
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (detected) setTimezone(detected);
    } catch {
      // Keep default
    }
  }, []);

  async function handleBook() {
    if (!selectedSlot || booking) return;
    setBooking(true);
    await new Promise(resolve => setTimeout(resolve, 1500));
    setBooking(false);
    setStep('confirmed');
  }

  const groupedSlots = groupSlotsByDate(slots, timezone);

  // Progress Steps Component
  const ProgressSteps = ({ currentStep }: { currentStep: Step }) => {
    const steps = [
      { key: 'select', label: 'Select Time' },
      { key: 'confirm', label: 'Confirm' },
      { key: 'confirmed', label: 'Done' },
    ];
    const currentIndex = steps.findIndex(s => s.key === currentStep);

    return (
      <div className="flex items-center justify-center mb-8">
        {steps.map((s, i) => (
          <div key={s.key} className="flex items-center">
            <div className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                  i < currentIndex
                    ? 'bg-green-600 text-white'
                    : i === currentIndex
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-500'
                }`}
              >
                {i < currentIndex ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span className={`ml-2 text-sm font-medium ${i <= currentIndex ? 'text-gray-900' : 'text-gray-400'}`}>
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`w-12 h-0.5 mx-4 ${i < currentIndex ? 'bg-green-600' : 'bg-gray-200'}`} />
            )}
          </div>
        ))}
      </div>
    );
  };

  // Confirmed Step
  if (step === 'confirmed' && selectedSlot) {
    const slotStart = new Date(selectedSlot.start);
    const slotEnd = new Date(selectedSlot.end);

    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-blue-600 text-white text-center py-2 text-sm font-medium">
          Demo Mode - Preview with Mock Data
        </div>
        <div className="max-w-2xl mx-auto px-4 py-12">
          <ProgressSteps currentStep="confirmed" />
          <div className="bg-white rounded-lg shadow p-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Interview Confirmed</h1>
              <p className="text-gray-600 mb-8">A calendar invitation has been sent to your email</p>
            </div>

            <div className="bg-gray-50 rounded-lg p-6 space-y-4">
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Date & Time</div>
                <div className="text-gray-900 font-medium">
                  {slotStart.toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                    timeZone: timezone,
                  })}
                </div>
                <div className="text-gray-600">
                  {slotStart.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: timezone })}
                  {' - '}
                  {slotEnd.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: timezone })}
                  <span className="text-gray-400 ml-2">({timezone.replace(/_/g, ' ')})</span>
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Interviewer</div>
                <div className="text-gray-900">sarah.chen@acme.com</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Meeting Link</div>
                <button
                  onClick={(e) => e.preventDefault()}
                  className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Join Meeting
                </button>
              </div>
            </div>

            <p className="text-center text-sm text-gray-500 mt-6">
              Need to reschedule? Contact your recruiter.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Confirm Step
  if (step === 'confirm' && selectedSlot) {
    const slotStart = new Date(selectedSlot.start);
    const slotEnd = new Date(selectedSlot.end);

    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-blue-600 text-white text-center py-2 text-sm font-medium">
          Demo Mode - Preview with Mock Data
        </div>
        <div className="max-w-2xl mx-auto px-4 py-12">
          <ProgressSteps currentStep="confirm" />
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b">
              <h1 className="text-xl font-bold text-gray-900">Confirm Your Interview</h1>
              <p className="text-gray-600 mt-1">Senior Software Engineer · 60 minutes</p>
            </div>
            <div className="p-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
                <div className="text-lg font-semibold text-gray-900">
                  {slotStart.toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                    timeZone: timezone,
                  })}
                </div>
                <div className="text-gray-700 mt-1">
                  {slotStart.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: timezone })}
                  {' - '}
                  {slotEnd.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: timezone })}
                </div>
                <div className="text-sm text-gray-500 mt-1">{timezone.replace(/_/g, ' ')}</div>
              </div>

              <div className="flex justify-between items-center pt-4 border-t">
                <button
                  onClick={() => setStep('select')}
                  disabled={booking}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  onClick={handleBook}
                  disabled={booking}
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2"
                >
                  {booking && (
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  )}
                  {booking ? 'Confirming...' : 'Confirm Booking'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Select Step
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-blue-600 text-white text-center py-2 text-sm font-medium">
        Demo Mode - Preview with Mock Data
      </div>
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Schedule Your Interview</h1>
          <p className="text-gray-600 mt-2">Senior Software Engineer · 60 minutes</p>
        </div>

        <ProgressSteps currentStep="select" />

        <div className="bg-white rounded-lg shadow">
          <div className="p-6">
            <div className="mb-6">
              <label htmlFor="timezone" className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Your Timezone
              </label>
              <select
                id="timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>{tz.label}</option>
                ))}
                {!COMMON_TIMEZONES.some(tz => tz.value === timezone) && (
                  <option value={timezone}>{timezone.replace(/_/g, ' ')}</option>
                )}
              </select>
            </div>

            {Object.entries(groupedSlots).map(([date, dateSlots]) => (
              <div key={date} className="mb-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-3 pb-2 border-b">{date}</h3>
                <div className="grid grid-cols-3 gap-2">
                  {dateSlots.map((slot) => {
                    const isSelected = selectedSlot?.slotId === slot.slotId;
                    return (
                      <button
                        key={slot.slotId}
                        onClick={() => setSelectedSlot(slot)}
                        className={`py-3 px-2 text-sm font-medium rounded-lg border transition ${
                          isSelected
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-900 border-gray-200 hover:border-blue-400 hover:bg-blue-50'
                        }`}
                      >
                        {formatSlotTime(slot, timezone)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            <div className="flex justify-end pt-4 border-t">
              <button
                onClick={() => selectedSlot && setStep('confirm')}
                disabled={!selectedSlot}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue
              </button>
            </div>
          </div>
        </div>

        <p className="text-center text-sm text-gray-500 mt-6">
          Having trouble? <a href="mailto:recruiting@company.com" className="text-blue-600 hover:underline">Contact support</a>
        </p>
      </div>
    </div>
  );
}
