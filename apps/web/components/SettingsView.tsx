'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Profile } from '@leanplate/contracts';
import { api, ApiError } from '@/lib/api';
import { explainFailure } from '@/lib/errors-ui';
import { ProfileWizard } from './ProfileWizard';

const CONFIRM_PHRASE = 'delete my account';

export function SettingsView({ email, profile }: { email: string; profile: Profile }) {
  const router = useRouter();
  const uid = useId();
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmData, setConfirmData] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState<'data' | 'account' | 'out' | null>(null);

  const fail = (e: unknown, fallback: string) => setError(e instanceof ApiError ? explainFailure(e) : fallback);

  async function signOut() {
    setBusy('out');
    try {
      await api.logout();
    } finally {
      window.location.assign('/');
    }
  }

  async function deleteData() {
    setBusy('data');
    setError(null);
    try {
      await api.deleteData();
      router.replace('/onboarding');
    } catch (e) {
      fail(e, 'We could not delete your data. Please try again.');
      setBusy(null);
    }
  }

  async function deleteAccount() {
    if (typed.trim().toLowerCase() !== CONFIRM_PHRASE) return;
    setBusy('account');
    setError(null);
    try {
      await api.deleteAccount();
      window.location.assign('/');
    } catch (e) {
      fail(e, 'We could not delete your account. Please try again.');
      setBusy(null);
    }
  }

  return (
    <div className="stack">
      <h1>Settings</h1>
      <div role="status" aria-live="polite">
        {msg && <p className="notice">{msg}</p>}
      </div>
      <div role="alert" aria-live="assertive">
        {error && <p className="alert">{error}</p>}
      </div>

      <section className="card" aria-labelledby={`${uid}-acct`}>
        <h2 id={`${uid}-acct`}>Account</h2>
        <p>
          Signed in as <strong>{email}</strong>
        </p>
        <button className="btn" onClick={signOut} disabled={busy !== null}>
          {busy === 'out' ? 'Signing out…' : 'Sign out'}
        </button>
      </section>

      <section aria-labelledby={`${uid}-plan`} className="stack">
        <div className="card">
          <h2 id={`${uid}-plan`}>Your details and plan</h2>
          {!editing && (
            <>
              <p className="muted">
                {profile.sex === 'female' ? 'Female' : 'Male'}, {profile.age}, {profile.heightCm} cm, {profile.weightKg} kg now, aiming for {profile.targetWeightKg} kg at a {profile.pace} pace.
              </p>
              <button className="btn btn-primary" onClick={() => { setEditing(true); setMsg(null); }}>
                Edit my details
              </button>
            </>
          )}
        </div>
        {editing && (
          <ProfileWizard
            mode="settings"
            initial={profile}
            onDone={() => {
              setEditing(false);
              setMsg('Your plan was updated.');
              router.refresh();
            }}
          />
        )}
      </section>

      <section className="card danger-zone" aria-labelledby={`${uid}-danger`}>
        <h2 id={`${uid}-danger`}>Your data</h2>
        <h3>Delete my meal data</h3>
        <p className="muted">This removes every meal you logged and your plan details. Your account stays, and you will set up your plan again.</p>
        {confirmData ? (
          <div className="row" role="group" aria-label="Confirm deleting meal data">
            <span>Are you sure?</span>
            <button className="btn btn-danger" onClick={deleteData} disabled={busy !== null}>
              {busy === 'data' ? 'Deleting…' : 'Yes, delete my meal data'}
            </button>
            <button className="btn" onClick={() => setConfirmData(false)} disabled={busy !== null} autoFocus>
              Keep it
            </button>
          </div>
        ) : (
          <button className="btn btn-outline-danger" onClick={() => setConfirmData(true)} disabled={busy !== null}>
            Delete my meal data
          </button>
        )}

        <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '22px 0' }} />

        <h3>Delete my account</h3>
        <p className="muted">This permanently deletes your account and everything in it. It cannot be undone.</p>
        <div className="field">
          <label htmlFor={`${uid}-confirm`}>
            Type <strong>{CONFIRM_PHRASE}</strong> to confirm
          </label>
          <input id={`${uid}-confirm`} className="input" autoComplete="off" autoCapitalize="none" spellCheck={false} value={typed} onChange={(e) => setTyped(e.target.value)} />
        </div>
        <button className="btn btn-danger" onClick={deleteAccount} disabled={busy !== null || typed.trim().toLowerCase() !== CONFIRM_PHRASE}>
          {busy === 'account' ? 'Deleting…' : 'Delete my account'}
        </button>
      </section>
    </div>
  );
}
