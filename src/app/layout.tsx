import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sched - Interview Scheduling Automation',
  description: 'Automate the entire interview scheduling workflow. From request to confirmation, every step is handled.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
