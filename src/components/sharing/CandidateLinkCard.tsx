/**
 * CandidateLinkCard - Prominent display for candidate scheduling links
 *
 * Shows the public link with one-click copy, candidate details,
 * and optional share actions.
 */

'use client';

import { useState } from 'react';
import { CopyLinkButton } from './CopyLinkButton';

export interface CandidateLinkCardProps {
  link: string;
  candidateName?: string;
  candidateEmail?: string;
  positionTitle?: string;
  expiresAt?: Date | string;
  variant?: 'success' | 'default';
  showEmail?: boolean;
  className?: string;
  onDismiss?: () => void;
}

export function CandidateLinkCard({
  link,
  candidateName,
  candidateEmail,
  positionTitle,
  expiresAt,
  variant = 'default',
  showEmail = true,
  className = '',
  onDismiss,
}: CandidateLinkCardProps) {
  const [showEmailModal, setShowEmailModal] = useState(false);

  const formatExpiryDate = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleEmailClick = () => {
    // Open default email client with pre-filled content
    const subject = positionTitle
      ? `Schedule your interview for ${positionTitle}`
      : 'Schedule your interview';
    const body = `Hi${candidateName ? ` ${candidateName.split(' ')[0]}` : ''},

Please use the link below to schedule your interview:

${link}

${expiresAt ? `This link expires on ${formatExpiryDate(expiresAt)}.` : ''}

Best regards`;

    const mailtoUrl = `mailto:${candidateEmail || ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailtoUrl, '_blank');
  };

  return (
    <div
      className={`
        rounded-xl border overflow-hidden
        ${variant === 'success'
          ? 'bg-[#1a5f5f]/5 border-[#1a5f5f]/20'
          : 'bg-white border-gray-200'
        }
        ${className}
      `}
    >
      {/* Header */}
      {variant === 'success' && (
        <div className="px-5 py-3 bg-[#1a5f5f]/10 border-b border-[#1a5f5f]/20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-[#1a5f5f] flex items-center justify-center">
              <svg
                className="w-3.5 h-3.5 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <span className="font-medium text-[#1a5f5f]">Request Created Successfully</span>
          </div>
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="text-[#1a5f5f]/60 hover:text-[#1a5f5f] transition-colors"
              aria-label="Dismiss"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* Content */}
      <div className="p-5">
        <p className="text-sm text-gray-600 mb-3">
          Share this link with your candidate:
        </p>

        {/* Link Box */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-mono text-gray-800 truncate">
                {link}
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <CopyLinkButton text={link} variant="primary" size="md" />

          {showEmail && (
            <button
              onClick={handleEmailClick}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
              Email
            </button>
          )}
        </div>

        {/* Details */}
        {(candidateName || positionTitle || expiresAt) && (
          <div className="pt-4 border-t border-gray-100 space-y-1.5">
            {candidateName && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500">Candidate:</span>
                <span className="font-medium text-gray-900">{candidateName}</span>
              </div>
            )}
            {positionTitle && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500">Position:</span>
                <span className="font-medium text-gray-900">{positionTitle}</span>
              </div>
            )}
            {expiresAt && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500">Expires:</span>
                <span className="font-medium text-gray-900">{formatExpiryDate(expiresAt)}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default CandidateLinkCard;
