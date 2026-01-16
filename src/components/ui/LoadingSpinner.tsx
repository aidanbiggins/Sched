/**
 * LoadingSpinner - Consistent loading indicator
 */

import React from 'react';

export interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  color?: 'indigo' | 'blue' | 'gray' | 'white';
}

const SIZE_CLASSES = {
  sm: 'w-4 h-4 border-2',
  md: 'w-6 h-6 border-2',
  lg: 'w-8 h-8 border-3',
};

const COLOR_CLASSES = {
  indigo: 'border-indigo-600 border-t-transparent',
  blue: 'border-blue-600 border-t-transparent',
  gray: 'border-gray-400 border-t-transparent',
  white: 'border-white border-t-transparent',
};

export function LoadingSpinner({
  size = 'md',
  className = '',
  color = 'indigo',
}: LoadingSpinnerProps) {
  return (
    <div
      className={`animate-spin rounded-full ${SIZE_CLASSES[size]} ${COLOR_CLASSES[color]} ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
}

export function LoadingPage({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <LoadingSpinner size="lg" />
        <p className="mt-4 text-slate-500">{message}</p>
      </div>
    </div>
  );
}

export default LoadingSpinner;
