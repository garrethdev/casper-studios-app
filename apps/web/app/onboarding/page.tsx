import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { ProfileWizard } from '@/components/ProfileWizard';
import { requireUser } from '@/lib/server/page-session';

export const metadata: Metadata = { title: 'Set up your plan' };
export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  await requireUser({ profile: 'absent', next: '/onboarding' });
  return (
    <AppShell signedIn={false}>
      <div className="stack" style={{ maxWidth: 640, margin: '0 auto' }}>
        <div>
          <h1>Let&apos;s set up your plan</h1>
          <p className="muted">Four short steps. You can change everything later in Settings.</p>
        </div>
        <ProfileWizard mode="onboarding" />
      </div>
    </AppShell>
  );
}
