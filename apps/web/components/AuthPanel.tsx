'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { explainFailure } from '@/lib/errors-ui';
import { passwordRules } from '@/lib/password-rules';

type Mode = 'login' | 'register';

export function AuthPanel({ nextPath, expired }: { nextPath: string | null; expired: boolean }) {
  const router = useRouter();
  const uid = useId();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resuming, setResuming] = useState(Boolean(nextPath) || expired);
  const errorRef = useRef<HTMLDivElement>(null);

  const go = async () => {
    const me = await api.me();
    router.replace(me.hasProfile ? (nextPath ?? '/dashboard') : '/onboarding');
  };

  // Access cookies live ten minutes. When one has lapsed, quietly renew from the refresh cookie and carry on.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (await api.resume()) {
          await go();
          return;
        }
      } catch {
        // fall through to the forms
      }
      if (!cancelled) setResuming(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const rules = passwordRules(password, email);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (mode === 'register' && !rules.lengthOk) {
      setError('Please use at least 12 characters in your password.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'register') await api.register(email, password);
      else await api.login(email, password);
      setPassword('');
      await go();
    } catch (err) {
      setError(err instanceof ApiError ? explainFailure(err, 'auth') : 'Something went wrong. Please try again.');
      setBusy(false);
    }
  }

  if (resuming) {
    return (
      <div className="card" role="status" aria-live="polite">
        <div className="row">
          <span className="spinner" aria-hidden="true" />
          <span>Signing you back in…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="tabs" role="tablist" aria-label="Sign in or create an account">
        {(['login', 'register'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            id={`${uid}-tab-${m}`}
            aria-selected={mode === m}
            aria-controls={`${uid}-panel`}
            tabIndex={mode === m ? 0 : -1}
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                const next = m === 'login' ? 'register' : 'login';
                setMode(next);
                setError(null);
                document.getElementById(`${uid}-tab-${next}`)?.focus();
              }
            }}
          >
            {m === 'login' ? 'Sign in' : 'Create account'}
          </button>
        ))}
      </div>

      <form id={`${uid}-panel`} role="tabpanel" aria-labelledby={`${uid}-tab-${mode}`} onSubmit={submit} noValidate>
        {expired && !error && <p className="notice">Your session ended, so please sign in again.</p>}
        <div aria-live="assertive" ref={errorRef} tabIndex={-1}>
          {error && <p className="alert">{error}</p>}
        </div>

        <div className="field">
          <label htmlFor={`${uid}-email`}>Email</label>
          <input
            id={`${uid}-email`}
            className="input"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor={`${uid}-pw`}>Password</label>
          <div className="input-row">
            <input
              id={`${uid}-pw`}
              className="input"
              type={show ? 'text' : 'password'}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-describedby={mode === 'register' ? `${uid}-rules` : undefined}
            />
            <button type="button" className="btn btn-small" onClick={() => setShow((s) => !s)} aria-pressed={show}>
              {show ? 'Hide' : 'Show'}
            </button>
          </div>
          {mode === 'register' && (
            <div id={`${uid}-rules`}>
              <p className="help" style={{ margin: '4px 0' }}>
                A long phrase works best, like three random words.
              </p>
              <ul className="rules">
                <li className={rules.lengthOk ? 'met' : ''}>
                  At least 12 characters <span className="muted">({Math.min(password.length, 99)} so far)</span>
                  <span className="sr-only">{rules.lengthOk ? ' met' : ' not met yet'}</span>
                </li>
                <li className={rules.variedOk ? 'met' : ''}>
                  A good mix of different characters<span className="sr-only">{rules.variedOk ? ' met' : ' not met yet'}</span>
                </li>
                <li className={rules.noEmailOk ? 'met' : ''}>
                  Does not contain your email name<span className="sr-only">{rules.noEmailOk ? ' met' : ' not met yet'}</span>
                </li>
              </ul>
            </div>
          )}
        </div>

        <button className="btn btn-primary btn-big" type="submit" disabled={busy || !email || !password} style={{ width: '100%' }}>
          {busy ? (
            <>
              <span className="spinner" aria-hidden="true" /> One moment…
            </>
          ) : mode === 'login' ? (
            'Sign in'
          ) : (
            'Create my account'
          )}
        </button>
      </form>
    </div>
  );
}
