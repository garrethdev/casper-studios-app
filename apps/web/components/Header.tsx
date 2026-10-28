'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from './Logo';

const LINKS = [
  { href: '/dashboard', label: 'Today' },
  { href: '/meals/new', label: 'Add meal' },
  { href: '/settings', label: 'Settings' },
];

export function Header({ signedIn }: { signedIn: boolean }) {
  const path = usePathname();
  return (
    <header className="site-header">
      <div className="wrap">
        <Link href={signedIn ? '/dashboard' : '/'} className="brand">
          <Logo /> Leanplate
        </Link>
        {signedIn && (
          <nav className="nav" aria-label="Main">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} aria-current={path === l.href ? 'page' : undefined}>
                {l.label}
              </Link>
            ))}
          </nav>
        )}
      </div>
    </header>
  );
}
