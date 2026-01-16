/**
 * CopyLinkButton - One-click copy with visual feedback
 *
 * Provides a prominent button to copy text to clipboard with
 * success/error states and toast notification.
 */

'use client';

import { useState, useCallback } from 'react';

export interface CopyLinkButtonProps {
  text: string;
  label?: string;
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  onCopy?: () => void;
}

const VARIANT_CLASSES = {
  primary: 'bg-[#1a5f5f] hover:bg-[#164d4d] text-white shadow-sm',
  secondary: 'bg-gray-100 hover:bg-gray-200 text-gray-700',
  outline: 'bg-white hover:bg-gray-50 text-[#1a5f5f] border border-[#1a5f5f]/30 hover:border-[#1a5f5f]',
};

const SIZE_CLASSES = {
  sm: 'px-3 py-1.5 text-sm gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-5 py-2.5 text-base gap-2',
};

export function CopyLinkButton({
  text,
  label = 'Copy Link',
  variant = 'primary',
  size = 'md',
  className = '',
  onCopy,
}: CopyLinkButtonProps) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setError(false);
      onCopy?.();

      // Reset after 2 seconds
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      setError(true);

      // Reset after 2 seconds
      setTimeout(() => {
        setError(false);
      }, 2000);
    }
  }, [text, onCopy]);

  const variantClass = VARIANT_CLASSES[variant];
  const sizeClass = SIZE_CLASSES[size];

  return (
    <button
      onClick={handleCopy}
      className={`
        inline-flex items-center justify-center font-medium rounded-lg
        transition-all duration-200
        ${variantClass}
        ${sizeClass}
        ${copied ? 'ring-2 ring-green-500 ring-offset-2' : ''}
        ${error ? 'ring-2 ring-red-500 ring-offset-2' : ''}
        ${className}
      `}
      aria-label={copied ? 'Copied!' : label}
    >
      {copied ? (
        <>
          <svg
            className="w-4 h-4 text-green-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
          <span className={variant === 'primary' ? 'text-white' : 'text-green-600'}>
            Copied!
          </span>
        </>
      ) : error ? (
        <>
          <svg
            className="w-4 h-4 text-red-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
          <span className={variant === 'primary' ? 'text-white' : 'text-red-600'}>
            Failed
          </span>
        </>
      ) : (
        <>
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
          <span>{label}</span>
        </>
      )}
    </button>
  );
}

export default CopyLinkButton;
