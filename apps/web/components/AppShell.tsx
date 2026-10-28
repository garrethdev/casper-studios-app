import type { ReactNode } from 'react';
import { Header } from './Header';

export function AppShell({ children, signedIn = true }: { children: ReactNode; signedIn?: boolean }) {
  return (
    <>
      <Header signedIn={signedIn} />
      <main id="main" tabIndex={-1}>
        <div className="wrap">{children}</div>
      </main>
    </>
  );
}
