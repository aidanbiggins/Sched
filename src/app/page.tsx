'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function LandingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Redirect to dashboard if already logged in
  useEffect(() => {
    if (status === 'authenticated') {
      router.push('/coordinator');
    }
  }, [status, router]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Background gradient */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-10 px-6 py-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-zinc-950">
                <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
                <path d="M3 10h18" stroke="currentColor" strokeWidth="2" />
                <path d="M8 2v4M16 2v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <span className="font-semibold text-lg">Sched</span>
          </div>
          <Link
            href="/signin"
            className="px-4 py-2 text-sm font-medium text-zinc-100 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg transition-colors"
          >
            Sign in
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="relative z-10 px-6">
        <div className="max-w-3xl mx-auto pt-20 pb-16 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-6">
            Interview scheduling
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500">
              without the back-and-forth
            </span>
          </h1>
          <p className="text-lg text-zinc-400 max-w-xl mx-auto mb-10">
            Send candidates a link. They pick a time that works.
            The meeting appears on everyone's calendar. Done.
          </p>
          <Link
            href="/signin"
            className="inline-flex items-center gap-2 px-6 py-3 text-base font-medium bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-zinc-950 rounded-xl transition-all shadow-lg shadow-amber-500/20"
          >
            Get started
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
            </svg>
          </Link>
        </div>

        {/* How it works */}
        <div className="max-w-4xl mx-auto py-16">
          <h2 className="text-center text-sm font-medium text-zinc-500 uppercase tracking-wider mb-12">
            How it works
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: '1',
                title: 'Create a request',
                desc: 'Set the interview duration, time window, and interviewer.',
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
                    <path d="M12 4v16m-8-8h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                ),
              },
              {
                step: '2',
                title: 'Share the link',
                desc: 'Candidate sees real-time availability and picks a slot.',
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
                    <path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    <path d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 10-5.656-5.656l-1.102 1.101" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                ),
              },
              {
                step: '3',
                title: 'Meeting created',
                desc: 'Calendar invite sent to everyone. Video link included.',
                icon: (
                  <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6">
                    <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ),
              },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-zinc-800/80 border border-zinc-700/50 flex items-center justify-center text-amber-400">
                  {item.icon}
                </div>
                <h3 className="text-lg font-medium mb-2">{item.title}</h3>
                <p className="text-sm text-zinc-400">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Features */}
        <div className="max-w-4xl mx-auto py-16 border-t border-zinc-800/50">
          <div className="grid sm:grid-cols-2 gap-6">
            {[
              {
                title: 'Google & Microsoft',
                desc: 'Connect your Google Calendar or Outlook. We check availability and create events on your behalf.',
              },
              {
                title: 'Video links included',
                desc: 'Google Meet or Microsoft Teams links are automatically added to every meeting.',
              },
              {
                title: 'Timezone smart',
                desc: 'Candidates see slots in their local time. No confusion, no missed meetings.',
              },
              {
                title: 'Reschedule & cancel',
                desc: 'Plans change. Update or cancel interviews with one click.',
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="p-5 rounded-xl bg-zinc-900/50 border border-zinc-800/50"
              >
                <h3 className="font-medium mb-1">{feature.title}</h3>
                <p className="text-sm text-zinc-400">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="max-w-xl mx-auto py-20 text-center">
          <h2 className="text-2xl font-semibold mb-4">Ready to save time?</h2>
          <p className="text-zinc-400 mb-8">
            Connect your calendar and send your first scheduling link in minutes.
          </p>
          <Link
            href="/signin"
            className="inline-flex items-center gap-2 px-6 py-3 text-base font-medium bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-zinc-950 rounded-xl transition-all shadow-lg shadow-amber-500/20"
          >
            Sign in to get started
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 px-6 py-8 border-t border-zinc-800/50">
        <div className="max-w-5xl mx-auto flex items-center justify-between text-sm text-zinc-500">
          <span>Sched - Interview Scheduling</span>
          <span>Built for recruiters who value their time</span>
        </div>
      </footer>
    </div>
  );
}
