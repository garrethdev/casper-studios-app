import { AppShell } from '@/components/AppShell';
import { AuthPanel } from '@/components/AuthPanel';
import { safeNext } from '@/lib/routing';

export const dynamic = 'force-dynamic';

export default async function Landing({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const next = safeNext(typeof sp.next === 'string' ? sp.next : null);
  const expired = typeof sp.expired === 'string';
  return (
    <AppShell signedIn={false}>
      <div className="hero">
        <div>
          <p className="eyebrow">Meals made simple</p>
          <h1>Know what is on your plate, and whether it is moving you forward.</h1>
          <p className="muted">
            Snap a photo or write a few words. Leanplate breaks your meal into foods, shows the numbers, and tells you kindly how it fits your goal.
          </p>
          <ul className="points">
            <li>
              <span className="dot" aria-hidden="true">1</span>
              <span>
                <strong>Photo or words.</strong> Either one works, and you can fix anything we get wrong.
              </span>
            </li>
            <li>
              <span className="dot" aria-hidden="true">2</span>
              <span>
                <strong>Food by food.</strong> See calories, protein, fiber and sugar for every item.
              </span>
            </li>
            <li>
              <span className="dot" aria-hidden="true">3</span>
              <span>
                <strong>Gentle guidance.</strong> A clear verdict and a tip or two, never a lecture.
              </span>
            </li>
          </ul>
          <p className="help">We keep only your plan and your meals, we never save your photos, and you can delete everything in Settings at any time.</p>
        </div>
        <AuthPanel nextPath={next} expired={expired} />
      </div>
    </AppShell>
  );
}
