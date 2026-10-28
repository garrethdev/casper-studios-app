import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { SettingsView } from '@/components/SettingsView';
import { requireUser } from '@/lib/server/page-session';

export const metadata: Metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const { user, profile } = await requireUser({ profile: 'required', next: '/settings' });
  return (
    <AppShell>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        <SettingsView email={user.email} profile={profile!} />
      </div>
    </AppShell>
  );
}
