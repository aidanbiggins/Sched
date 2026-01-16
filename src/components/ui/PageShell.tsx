/**
 * PageShell - Consistent page layout wrapper
 *
 * Provides standardized page structure with header, content area,
 * and optional back navigation.
 */

'use client';

import React from 'react';
import Link from 'next/link';

export interface PageShellProps {
  title: string;
  subtitle?: string;
  backLink?: {
    href: string;
    label: string;
  };
  actions?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl' | '6xl' | '7xl' | 'full';
  variant?: 'light' | 'dark';
  className?: string;
}

const MAX_WIDTH_CLASSES: Record<string, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '4xl': 'max-w-4xl',
  '6xl': 'max-w-6xl',
  '7xl': 'max-w-7xl',
  full: 'max-w-full',
};

export function PageShell({
  title,
  subtitle,
  backLink,
  actions,
  children,
  maxWidth = '7xl',
  variant = 'light',
  className = '',
}: PageShellProps) {
  const bgClass = variant === 'dark' ? 'bg-zinc-950' : 'bg-slate-50';
  const headerBgClass = variant === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-200';
  const titleClass = variant === 'dark' ? 'text-zinc-100' : 'text-slate-900';
  const subtitleClass = variant === 'dark' ? 'text-zinc-400' : 'text-slate-500';
  const linkClass = variant === 'dark' ? 'text-zinc-400 hover:text-zinc-200' : 'text-indigo-600 hover:text-indigo-800';

  return (
    <div className={`min-h-screen ${bgClass} ${className}`}>
      {/* Header */}
      <header className={`${headerBgClass} border-b shadow-sm sticky top-0 z-30`}>
        <div className={`${MAX_WIDTH_CLASSES[maxWidth]} mx-auto px-4 py-4`}>
          {backLink && (
            <Link href={backLink.href} className={`${linkClass} text-sm mb-2 inline-block`}>
              &larr; {backLink.label}
            </Link>
          )}
          <div className="flex items-center justify-between">
            <div>
              <h1 className={`text-xl font-semibold ${titleClass}`}>{title}</h1>
              {subtitle && <p className={`text-sm ${subtitleClass} mt-0.5`}>{subtitle}</p>}
            </div>
            {actions && <div className="flex items-center gap-4">{actions}</div>}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className={`${MAX_WIDTH_CLASSES[maxWidth]} mx-auto px-4 py-6`}>{children}</main>
    </div>
  );
}

export default PageShell;
