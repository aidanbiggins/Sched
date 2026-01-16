'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function LandingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Redirect to hub if already logged in
  useEffect(() => {
    if (status === 'authenticated') {
      router.push('/hub');
    }
  }, [status, router]);

  if (status === 'loading' || !mounted) {
    return (
      <div className="min-h-screen bg-[#faf9f7] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#1a5f5f] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#faf9f7] text-[#1a1a1a] overflow-x-hidden">
      {/* Subtle grid pattern background */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.02]"
        style={{
          backgroundImage: `
            linear-gradient(to right, #1a5f5f 1px, transparent 1px),
            linear-gradient(to bottom, #1a5f5f 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px'
        }}
      />

      {/* Header */}
      <header className="relative z-10 px-6 py-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-[#1a5f5f] flex items-center justify-center shadow-lg shadow-[#1a5f5f]/20">
                <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-white">
                  <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
                  <path d="M3 10h18" stroke="currentColor" strokeWidth="2" />
                  <path d="M8 2v4M16 2v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="12" cy="16" r="2" fill="currentColor" />
                </svg>
              </div>
              <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-[#e8b44f] rounded-full" />
            </div>
            <span
              className="text-xl tracking-tight"
              style={{ fontFamily: 'Georgia, serif', fontWeight: 500 }}
            >
              Sched
            </span>
          </div>
          <Link
            href="/signin"
            className="px-5 py-2.5 text-sm font-medium text-[#1a5f5f] border border-[#1a5f5f]/30 hover:border-[#1a5f5f] hover:bg-[#1a5f5f] hover:text-white rounded-full transition-all duration-300"
          >
            Sign in
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="relative z-10">
        <section className="px-6 pt-16 pb-24">
          <div className="max-w-7xl mx-auto">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              {/* Left: Copy */}
              <div>
                <div
                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#1a5f5f]/5 border border-[#1a5f5f]/10 rounded-full text-xs text-[#1a5f5f] font-medium mb-6 animate-[fadeIn_0.6s_ease-out]"
                >
                  <span className="w-1.5 h-1.5 bg-[#1a5f5f] rounded-full animate-pulse" />
                  Interview Scheduling Platform
                </div>

                <h1
                  className="text-4xl sm:text-5xl lg:text-6xl leading-[1.1] tracking-tight mb-6 animate-[fadeIn_0.6s_ease-out_0.1s_both]"
                  style={{ fontFamily: 'Georgia, serif' }}
                >
                  Schedule interviews
                  <br />
                  <span className="text-[#1a5f5f]">without the chaos</span>
                </h1>

                <p
                  className="text-lg text-[#666] leading-relaxed max-w-md mb-8 animate-[fadeIn_0.6s_ease-out_0.2s_both]"
                  style={{ fontFamily: 'system-ui, sans-serif' }}
                >
                  Recruiters send a link. Candidates pick a time. Calendar events
                  appear automatically. No more email ping-pong.
                </p>

                <div className="flex flex-wrap gap-4 animate-[fadeIn_0.6s_ease-out_0.3s_both]">
                  <Link
                    href="/signin"
                    className="inline-flex items-center gap-2 px-6 py-3.5 text-base font-medium bg-[#1a5f5f] hover:bg-[#164d4d] text-white rounded-full transition-all duration-300 shadow-lg shadow-[#1a5f5f]/20 hover:shadow-xl hover:shadow-[#1a5f5f]/30 hover:-translate-y-0.5"
                  >
                    Get started
                    <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                      <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
                    </svg>
                  </Link>
                  <Link
                    href="/book/demo"
                    className="inline-flex items-center gap-2 px-6 py-3.5 text-base font-medium text-[#1a1a1a] border border-[#ddd] hover:border-[#1a5f5f] rounded-full transition-all duration-300 hover:bg-white"
                  >
                    Try the demo
                  </Link>
                </div>
              </div>

              {/* Right: Visual mockup */}
              <div className="relative animate-[fadeIn_0.8s_ease-out_0.4s_both]">
                {/* Browser window mockup */}
                <div className="bg-white rounded-2xl border border-[#e5e5e5] shadow-2xl shadow-black/10 overflow-hidden">
                  {/* Browser chrome */}
                  <div className="flex items-center gap-2 px-4 py-3 bg-[#f8f8f8] border-b border-[#e5e5e5]">
                    <div className="flex gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
                      <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
                      <div className="w-3 h-3 rounded-full bg-[#28c840]" />
                    </div>
                    <div className="flex-1 flex justify-center">
                      <div className="px-4 py-1 bg-white rounded-md text-xs text-[#999] border border-[#e5e5e5]">
                        sched.app/book/abc123
                      </div>
                    </div>
                  </div>

                  {/* Calendar content */}
                  <div className="p-6">
                    <div className="mb-4">
                      <p className="text-sm text-[#666] mb-1">Interview with</p>
                      <p className="font-medium text-lg">Acme Corp Engineering Team</p>
                    </div>

                    {/* Week selector */}
                    <div className="flex items-center justify-between mb-4">
                      <button className="p-2 hover:bg-[#f5f5f5] rounded-lg transition-colors">
                        <svg className="w-4 h-4 text-[#666]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>
                      <span className="font-medium">January 20 - 24, 2026</span>
                      <button className="p-2 hover:bg-[#f5f5f5] rounded-lg transition-colors">
                        <svg className="w-4 h-4 text-[#666]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </div>

                    {/* Day headers */}
                    <div className="grid grid-cols-5 gap-2 mb-2">
                      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((day, i) => (
                        <div key={day} className="text-center">
                          <div className="text-xs text-[#999] font-medium">{day}</div>
                          <div className="text-sm font-medium text-[#333]">{20 + i}</div>
                        </div>
                      ))}
                    </div>

                    {/* Time slots */}
                    <div className="grid grid-cols-5 gap-2">
                      {[
                        [true, false, true, false, false],
                        [true, true, false, true, false],
                        [false, true, true, 'selected', true],
                        [true, false, true, true, false],
                      ].map((row, rowIdx) => (
                        row.map((slot, colIdx) => (
                          <div
                            key={`${rowIdx}-${colIdx}`}
                            className={`
                              py-2.5 rounded-lg text-xs text-center font-medium transition-all
                              ${slot === 'selected'
                                ? 'bg-[#1a5f5f] text-white shadow-md'
                                : slot
                                  ? 'bg-[#1a5f5f]/10 text-[#1a5f5f] hover:bg-[#1a5f5f]/20 cursor-pointer'
                                  : 'bg-[#f5f5f5] text-[#ccc]'
                              }
                            `}
                          >
                            {9 + rowIdx}:00
                          </div>
                        ))
                      ))}
                    </div>

                    {/* Selected time */}
                    <div className="mt-4 pt-4 border-t border-[#eee]">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-[#1a5f5f]" />
                          <span className="text-sm">
                            <span className="text-[#666]">Selected:</span>{' '}
                            <span className="font-medium">Thu, Jan 23 at 11:00 AM</span>
                          </span>
                        </div>
                        <button className="px-4 py-2 bg-[#1a5f5f] text-white text-sm font-medium rounded-lg">
                          Confirm
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Floating badge */}
                <div className="absolute -bottom-3 -left-3 bg-[#e8b44f] text-white px-4 py-2 rounded-full text-sm font-medium shadow-lg flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Booked!
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* User Flow Visual */}
        <section className="px-6 py-20 bg-white border-y border-[#eee]">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-12">
              <h2
                className="text-3xl sm:text-4xl tracking-tight mb-3"
                style={{ fontFamily: 'Georgia, serif' }}
              >
                How it works
              </h2>
              <p className="text-[#666]">
                From request to booked meeting in four simple steps
              </p>
            </div>

            {/* Flow Steps - Horizontal */}
            <div className="relative">
              {/* Connection line */}
              <div className="hidden lg:block absolute top-16 left-[10%] right-[10%] h-0.5 bg-gradient-to-r from-[#1a5f5f] via-[#1a5f5f]/50 to-[#1a5f5f]" />

              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
                {[
                  {
                    step: 1,
                    title: 'Create Request',
                    desc: 'Set duration, interviewers, and availability window',
                    icon: (
                      <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
                        <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
                        <path d="M9 12h6M12 9v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    ),
                    actor: 'Coordinator'
                  },
                  {
                    step: 2,
                    title: 'Share Link',
                    desc: 'Candidate receives a personalized booking link',
                    icon: (
                      <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
                        <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    ),
                    actor: 'System'
                  },
                  {
                    step: 3,
                    title: 'Pick Time',
                    desc: 'Candidate selects from available slots',
                    icon: (
                      <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
                        <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
                        <path d="M3 10h18" stroke="currentColor" strokeWidth="1.5" />
                        <path d="M9 15l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ),
                    actor: 'Candidate'
                  },
                  {
                    step: 4,
                    title: 'Done',
                    desc: 'Calendar events created for everyone',
                    icon: (
                      <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
                        <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
                      </svg>
                    ),
                    actor: 'Everyone'
                  },
                ].map((item, index) => (
                  <div
                    key={item.step}
                    className="relative flex flex-col items-center text-center group"
                  >
                    {/* Step circle */}
                    <div className="relative z-10 w-12 h-12 rounded-full bg-[#1a5f5f] flex items-center justify-center text-white font-semibold text-sm mb-5 shadow-lg shadow-[#1a5f5f]/30 group-hover:scale-110 transition-transform duration-300">
                      {item.step}
                    </div>

                    {/* Content */}
                    <div className="text-[#1a5f5f] mb-3">
                      {item.icon}
                    </div>
                    <h3
                      className="text-lg font-medium mb-2"
                      style={{ fontFamily: 'Georgia, serif' }}
                    >
                      {item.title}
                    </h3>
                    <p className="text-sm text-[#666] mb-3 max-w-[200px]">{item.desc}</p>
                    <span className="px-3 py-1 text-xs rounded-full bg-[#1a5f5f]/10 text-[#1a5f5f] font-medium">
                      {item.actor}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="px-6 py-20">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-12">
              <h2
                className="text-3xl sm:text-4xl tracking-tight mb-3"
                style={{ fontFamily: 'Georgia, serif' }}
              >
                Built for{' '}
                <span className="text-[#1a5f5f]">recruiting teams</span>
              </h2>
              <p className="text-[#666] max-w-lg mx-auto">
                Everything you need to schedule interviews efficiently
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                {
                  title: 'Calendar Sync',
                  desc: 'Connect Google or Microsoft calendars. We check availability automatically.',
                  icon: (
                    <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
                      <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
                      <path d="M3 10h18M8 2v4M16 2v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  )
                },
                {
                  title: 'Video Links',
                  desc: 'Google Meet or Teams links added to every meeting automatically.',
                  icon: (
                    <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
                      <rect x="2" y="5" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
                      <path d="M16 12l6-4v8l-6-4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                    </svg>
                  )
                },
                {
                  title: 'Timezones',
                  desc: 'Candidates see slots in their local time. Zero confusion.',
                  icon: (
                    <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
                      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
                      <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  )
                },
                {
                  title: 'Two Modes',
                  desc: 'Pick slots for candidates, or let them choose their own.',
                  icon: (
                    <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
                      <path d="M8 6h8M8 12h8M8 18h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      <circle cx="4" cy="6" r="1.5" fill="currentColor" />
                      <circle cx="4" cy="12" r="1.5" fill="currentColor" />
                      <circle cx="4" cy="18" r="1.5" fill="currentColor" />
                    </svg>
                  )
                },
              ].map((feature) => (
                <div
                  key={feature.title}
                  className="p-6 bg-white rounded-2xl border border-[#eee] hover:border-[#1a5f5f]/30 hover:shadow-lg transition-all duration-300 group"
                >
                  <div className="w-12 h-12 rounded-xl bg-[#1a5f5f]/10 flex items-center justify-center text-[#1a5f5f] mb-4 group-hover:bg-[#1a5f5f] group-hover:text-white transition-colors duration-300">
                    {feature.icon}
                  </div>
                  <h3 className="font-medium mb-2">{feature.title}</h3>
                  <p className="text-sm text-[#666] leading-relaxed">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Demo Section */}
        <section className="px-6 py-20 bg-[#1a5f5f]">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-12">
              <h2
                className="text-3xl sm:text-4xl tracking-tight mb-3 text-white"
                style={{ fontFamily: 'Georgia, serif' }}
              >
                Try it yourself
              </h2>
              <p className="text-white/70">
                Explore the different parts of the system
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {[
                {
                  title: 'Coordinator Dashboard',
                  desc: 'Create and manage scheduling requests',
                  href: '/coordinator',
                  icon: (
                    <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7">
                      <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
                      <path d="M3 9h18M9 21V9" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                  ),
                  badge: 'For recruiters'
                },
                {
                  title: 'Candidate Booking',
                  desc: 'Experience the booking flow',
                  href: '/book/demo',
                  icon: (
                    <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7">
                      <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
                      <path d="M3 10h18M8 2v4M16 2v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  ),
                  badge: 'For candidates'
                },
                {
                  title: 'Ops Dashboard',
                  desc: 'Monitor system health and status',
                  href: '/ops',
                  icon: (
                    <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7">
                      <path d="M3 12h4l3-9 4 18 3-9h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ),
                  badge: 'For admins'
                },
              ].map((demo) => (
                <Link
                  key={demo.href}
                  href={demo.href}
                  className="group relative bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-6 hover:bg-white/20 transition-all duration-300 hover:-translate-y-1"
                >
                  <div className="text-white/80 mb-4 group-hover:text-white transition-colors">
                    {demo.icon}
                  </div>
                  <h3
                    className="text-xl text-white mb-2"
                    style={{ fontFamily: 'Georgia, serif' }}
                  >
                    {demo.title}
                  </h3>
                  <p className="text-white/60 text-sm mb-4">{demo.desc}</p>
                  <span className="inline-block px-3 py-1 bg-white/10 text-white/80 text-xs rounded-full">
                    {demo.badge}
                  </span>
                  <div className="absolute top-6 right-6 text-white/40 group-hover:text-white group-hover:translate-x-1 transition-all">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="px-6 py-20">
          <div className="max-w-2xl mx-auto text-center">
            <h2
              className="text-3xl sm:text-4xl tracking-tight mb-4"
              style={{ fontFamily: 'Georgia, serif' }}
            >
              Ready to simplify
              <br />
              <span className="text-[#1a5f5f]">interview scheduling?</span>
            </h2>
            <p className="text-lg text-[#666] mb-8">
              Connect your calendar and send your first scheduling link in minutes.
            </p>
            <Link
              href="/signin"
              className="inline-flex items-center gap-2 px-8 py-4 text-lg font-medium bg-[#1a5f5f] hover:bg-[#164d4d] text-white rounded-full transition-all duration-300 shadow-lg shadow-[#1a5f5f]/20 hover:shadow-xl hover:shadow-[#1a5f5f]/30 hover:-translate-y-0.5"
            >
              Sign in to get started
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
              </svg>
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-10 px-6 py-6 border-t border-[#eee]">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-[#999]">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-[#1a5f5f] flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5 text-white">
                <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
                <path d="M3 10h18" stroke="currentColor" strokeWidth="2" />
              </svg>
            </div>
            <span>Sched</span>
          </div>
          <span>Built for recruiters who value their time</span>
        </div>
      </footer>

      {/* Animation keyframes */}
      <style jsx global>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
