import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { MealComposer } from '@/components/MealComposer';
import { requireUser } from '@/lib/server/page-session';

export const metadata: Metadata = { title: 'Add a meal' };
export const dynamic = 'force-dynamic';

export default async function NewMealPage() {
  await requireUser({ profile: 'required', next: '/meals/new' });
  return (
    <AppShell>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <MealComposer />
      </div>
    </AppShell>
  );
}
