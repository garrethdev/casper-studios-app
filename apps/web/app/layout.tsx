import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Leanplate', template: '%s · Leanplate' },
  description: 'Snap or describe a meal and see whether it moves you toward your weight goal.',
  referrer: 'no-referrer',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf7f2' },
    { media: '(prefers-color-scheme: dark)', color: '#161411' },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Reading request headers makes every page render per request, which the per-request CSP nonce requires.
  await headers();
  return (
    <html lang="en">
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
