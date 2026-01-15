'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';

// Workflow steps
const steps = [
  { id: '01', title: 'Request Created', desc: 'Coordinator sets up interview parameters' },
  { id: '02', title: 'Link Delivered', desc: 'Candidate receives secure booking link' },
  { id: '03', title: 'Slot Selected', desc: 'Real-time availability, instant selection' },
  { id: '04', title: 'Calendar Synced', desc: 'Microsoft Graph creates the event' },
  { id: '05', title: 'ATS Updated', desc: 'iCIMS record logged automatically' },
];

// Feature cards
const features = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
        <path d="M12 8v4l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
    title: 'Real-time Slots',
    desc: 'Live calendar availability from Microsoft Graph. Zero double-bookings.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
        <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: 'Auto ATS Sync',
    desc: 'Every action logged to iCIMS. Bookings, cancellations, reschedules.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
        <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12 3l1.5 1.5M12 3L10.5 4.5M12 3v3m6.36.64l-1.06 1.06m1.06-1.06l-1.5-.5m1.5.5l-1.5.5M21 12l-1.5 1.5M21 12l-1.5-1.5M21 12h-3m-.64 6.36l-1.06-1.06m1.06 1.06l.5-1.5m-.5 1.5l-.5-1.5M12 21l-1.5-1.5M12 21l1.5-1.5M12 21v-3m-6.36-.64l1.06-1.06m-1.06 1.06l1.5.5m-1.5-.5l1.5-.5M3 12l1.5-1.5M3 12l1.5 1.5M3 12h3m.64-6.36l1.06 1.06m-1.06-1.06l-.5 1.5m.5-1.5l.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    title: 'Self-healing',
    desc: 'Reconciliation engine detects and repairs drift automatically.',
  },
];

// Demo links
const demos = [
  { href: '/coordinator', label: 'Dashboard', desc: 'Manage all scheduling requests' },
  { href: '/book/demo', label: 'Booking Flow', desc: 'Candidate experience demo' },
  { href: '/ops', label: 'System Health', desc: 'Webhooks & reconciliation' },
];

function GradientOrb({ className }: { className?: string }) {
  return (
    <div className={`absolute rounded-full blur-3xl opacity-20 ${className}`} />
  );
}

function GridPattern() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <svg className="absolute inset-0 w-full h-full opacity-[0.02]" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
            <path d="M 60 0 L 0 0 0 60" fill="none" stroke="white" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-zinc-950" />
    </div>
  );
}

export default function LandingPage() {
  const [mounted, setMounted] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % steps.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (heroRef.current) {
        const rect = heroRef.current.getBoundingClientRect();
        setMousePos({
          x: ((e.clientX - rect.left) / rect.width) * 100,
          y: ((e.clientY - rect.top) / rect.height) * 100,
        });
      }
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 overflow-x-hidden">
      {/* Hero */}
      <section ref={heroRef} className="relative min-h-screen flex flex-col">
        <GridPattern />

        {/* Gradient orbs */}
        <GradientOrb className="w-[800px] h-[800px] -top-40 -left-40 bg-amber-500" />
        <GradientOrb className="w-[600px] h-[600px] top-1/2 right-0 bg-emerald-500" />

        {/* Mouse follower gradient */}
        <div
          className="absolute w-[500px] h-[500px] rounded-full bg-amber-500/10 blur-3xl pointer-events-none transition-all duration-1000 ease-out"
          style={{
            left: `${mousePos.x}%`,
            top: `${mousePos.y}%`,
            transform: 'translate(-50%, -50%)',
          }}
        />

        {/* Nav */}
        <nav className={`relative z-20 flex items-center justify-between px-6 lg:px-12 py-6 transition-all duration-1000 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-zinc-950">
                <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
                <path d="M3 10h18" stroke="currentColor" strokeWidth="2" />
                <path d="M8 2v4M16 2v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <span className="text-lg font-semibold tracking-tight">Sched</span>
          </div>

          <div className="hidden md:flex items-center gap-1">
            {demos.map((demo) => (
              <Link
                key={demo.href}
                href={demo.href}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50 rounded-lg transition-all"
              >
                {demo.label}
              </Link>
            ))}
          </div>
        </nav>

        {/* Hero content */}
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 text-center">
          <div className={`transition-all duration-1000 delay-200 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-800/80 border border-zinc-700/50 text-xs text-zinc-400 mb-8 backdrop-blur-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Interview Scheduling Automation
            </div>
          </div>

          <h1 className={`text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-medium tracking-tight leading-[0.95] mb-6 transition-all duration-1000 delay-300 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <span className="block">Scheduling that</span>
            <span className="block bg-gradient-to-r from-amber-200 via-amber-400 to-orange-400 bg-clip-text text-transparent">
              works itself
            </span>
          </h1>

          <p className={`text-lg md:text-xl text-zinc-400 max-w-xl mx-auto mb-10 leading-relaxed transition-all duration-1000 delay-400 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            From request to confirmation, every step handled. Calendar invites sent, ATS updated, candidates delighted.
          </p>

          <div className={`flex flex-col sm:flex-row items-center gap-4 transition-all duration-1000 delay-500 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <Link
              href="/coordinator"
              className="group relative px-6 py-3 bg-gradient-to-r from-amber-400 to-orange-500 text-zinc-950 font-medium rounded-xl hover:shadow-lg hover:shadow-amber-500/25 transition-all hover:-translate-y-0.5"
            >
              <span className="relative z-10 flex items-center gap-2">
                Open Dashboard
                <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 transition-transform group-hover:translate-x-0.5">
                  <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </Link>
            <Link
              href="/book/demo"
              className="px-6 py-3 text-zinc-300 font-medium rounded-xl border border-zinc-700 hover:border-zinc-600 hover:bg-zinc-800/50 transition-all"
            >
              Try Booking Flow
            </Link>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className={`relative z-10 flex justify-center pb-8 transition-all duration-1000 delay-700 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
          <div className="flex flex-col items-center gap-2 text-zinc-500">
            <span className="text-[10px] uppercase tracking-[0.2em]">Scroll</span>
            <div className="w-px h-8 bg-gradient-to-b from-zinc-500 to-transparent" />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="relative py-32 px-6 lg:px-12">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-20">
            <p className="text-xs uppercase tracking-[0.2em] text-amber-400 mb-4">How it works</p>
            <h2 className="text-4xl md:text-5xl font-medium tracking-tight">
              Five steps to booked
            </h2>
          </div>

          {/* Steps */}
          <div className="relative">
            {/* Progress bar */}
            <div className="absolute left-0 right-0 top-6 h-px bg-zinc-800 hidden md:block">
              <div
                className="h-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-500 ease-out"
                style={{ width: `${((activeStep + 1) / steps.length) * 100}%` }}
              />
            </div>

            <div className="grid md:grid-cols-5 gap-8 md:gap-4">
              {steps.map((step, i) => (
                <button
                  key={step.id}
                  onClick={() => setActiveStep(i)}
                  className={`relative text-left md:text-center group transition-all duration-300 ${
                    activeStep === i ? 'opacity-100' : 'opacity-40 hover:opacity-70'
                  }`}
                >
                  {/* Dot */}
                  <div className={`hidden md:flex w-12 h-12 mx-auto mb-4 rounded-full items-center justify-center transition-all duration-300 ${
                    activeStep >= i
                      ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-zinc-950'
                      : 'bg-zinc-800 text-zinc-500'
                  }`}>
                    <span className="text-sm font-semibold">{step.id}</span>
                  </div>

                  {/* Mobile number */}
                  <div className="md:hidden flex items-center gap-3 mb-2">
                    <span className={`text-xs font-mono ${activeStep >= i ? 'text-amber-400' : 'text-zinc-600'}`}>
                      {step.id}
                    </span>
                    <div className={`flex-1 h-px ${activeStep >= i ? 'bg-amber-400/30' : 'bg-zinc-800'}`} />
                  </div>

                  <h3 className="text-sm font-medium text-zinc-100 mb-1">{step.title}</h3>
                  <p className="text-xs text-zinc-500 leading-relaxed">{step.desc}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="relative py-32 px-6 lg:px-12 bg-zinc-900/50">
        <GradientOrb className="w-[600px] h-[600px] -bottom-40 left-1/2 -translate-x-1/2 bg-amber-500" />

        <div className="relative max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-xs uppercase tracking-[0.2em] text-amber-400 mb-4">Built for reliability</p>
            <h2 className="text-4xl md:text-5xl font-medium tracking-tight">
              Enterprise-grade automation
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {features.map((feature, i) => (
              <div
                key={feature.title}
                className="group relative p-6 rounded-2xl bg-zinc-900/80 border border-zinc-800 hover:border-zinc-700 transition-all hover:-translate-y-1"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center text-amber-400 mb-4 group-hover:bg-amber-400/10 transition-colors">
                  {feature.icon}
                </div>
                <h3 className="text-lg font-medium mb-2">{feature.title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA / Demos */}
      <section className="relative py-32 px-6 lg:px-12">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-medium tracking-tight mb-4">
            See it in action
          </h2>
          <p className="text-zinc-400 mb-12">
            Explore the coordinator dashboard, try the candidate booking experience, or check system health.
          </p>

          <div className="grid sm:grid-cols-3 gap-4">
            {demos.map((demo) => (
              <Link
                key={demo.href}
                href={demo.href}
                className="group p-6 rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-amber-500/50 hover:bg-zinc-900/80 transition-all"
              >
                <h3 className="font-medium mb-1 group-hover:text-amber-400 transition-colors">
                  {demo.label}
                </h3>
                <p className="text-sm text-zinc-500">{demo.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative py-8 px-6 lg:px-12 border-t border-zinc-800">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5 text-zinc-950">
                <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
                <path d="M3 10h18" stroke="currentColor" strokeWidth="2" />
              </svg>
            </div>
            <span className="text-sm text-zinc-500">Sched</span>
          </div>

          <div className="flex items-center gap-6 text-sm text-zinc-500">
            {demos.map((demo) => (
              <Link key={demo.href} href={demo.href} className="hover:text-zinc-300 transition-colors">
                {demo.label}
              </Link>
            ))}
          </div>

          <p className="text-xs text-zinc-600">
            Next.js + Microsoft Graph + iCIMS
          </p>
        </div>
      </footer>
    </div>
  );
}
