import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { Dashboard } from '@/components/Dashboard';
import { friendlyName } from '@/lib/names';
import { requireUser } from '@/lib/server/page-session';

export const metadata: Metadata = { title: 'Today' };
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const { user } = await requireUser({ profile: 'required', next: '/dashboard' });
  return (
    <AppShell>
      <Dashboard name={friendlyName(user.email)} />
    </AppShell>
  );
}
