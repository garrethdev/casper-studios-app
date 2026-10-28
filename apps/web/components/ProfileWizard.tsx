'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Allergen, Profile, Targets } from '@leanplate/contracts';
import { api, ApiError } from '@/lib/api';
import { explainFailure } from '@/lib/errors-ui';
import {
  PACE_KG,
  buildProfilePayload,
  emptyForm,
  formFromProfile,
  hasErrors,
  heightToCm,
  switchHeightUnit,
  switchWeightUnit,
  validateStep,
  weightToKg,
  type FieldErrors,
  type WizardForm,
} from '@/lib/profile-form';
import { formatFtIn, formatPace, kgToLb } from '@/lib/units';
import { PlanCard } from './PlanCard';

export const DISCLAIMER =
  'Leanplate gives general information, not medical advice. Talk to a doctor before a diet change, especially if you are pregnant, under 18, or have a health condition.';

const ACTIVITY = [
  { v: 'sedentary', t: 'Mostly sitting', d: 'A desk job or lots of time sitting, and little planned exercise.' },
  { v: 'light', t: 'Lightly active', d: 'On your feet some of the day, or exercise 1 to 3 days a week.' },
  { v: 'moderate', t: 'Moderately active', d: 'Exercise 3 to 5 days a week, or a job that keeps you moving.' },
  { v: 'active', t: 'Very active', d: 'Hard exercise most days, or a physically demanding job.' },
] as const;

const PACES = [
  { v: 'gentle', t: 'Gentle', d: 'The easiest to keep up. Good if you want steady habits.' },
  { v: 'steady', t: 'Steady', d: 'A balanced pace that most people can stick with.' },
  { v: 'faster', t: 'Faster', d: 'Needs more focus. You can always slow down later.' },
] as const;

const DIETS = [
  { v: 'none', t: 'No special diet' },
  { v: 'vegetarian', t: 'Vegetarian' },
  { v: 'vegan', t: 'Vegan' },
  { v: 'pescatarian', t: 'Pescatarian' },
] as const;

const ALLERGENS: { v: Allergen; t: string }[] = [
  { v: 'peanut', t: 'Peanuts' },
  { v: 'tree-nut', t: 'Tree nuts' },
  { v: 'dairy', t: 'Dairy' },
  { v: 'egg', t: 'Egg' },
  { v: 'gluten', t: 'Gluten' },
  { v: 'soy', t: 'Soy' },
  { v: 'shellfish', t: 'Shellfish' },
  { v: 'fish', t: 'Fish' },
  { v: 'sesame', t: 'Sesame' },
];

const STEP_TITLES = ['About you', 'Your goal', 'Food preferences', 'Review your plan'];

export function ProfileWizard({ mode, initial, onDone }: { mode: 'onboarding' | 'settings'; initial?: Profile; onDone?: () => void }) {
  const router = useRouter();
  const uid = useId();
  const [form, setForm] = useState<WizardForm>(() => (initial ? formFromProfile(initial) : emptyForm()));
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [targets, setTargets] = useState<Targets | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const savingRef = useRef(false);
  const first = useRef(true);

  const set = <K extends keyof WizardForm>(k: K, v: WizardForm[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setSaveError(null);
  };

  // Once a step has been tried, keep its messages in step with what the person types, so a fixed field stops complaining.
  useEffect(() => {
    if (attempted) setErrors(validateStep(step, form));
  }, [attempted, step, form]);

  // Move focus to the new step's heading so keyboard and screen reader users land in the right place.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step, targets]);

  const focusFirstError = () => {
    requestAnimationFrame(() => {
      const el = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
      if (!el) return;
      (el.matches('input,select,textarea,button') ? el : el.querySelector<HTMLElement>('input'))?.focus();
    });
  };

  function next() {
    const errs = validateStep(step, form);
    setErrors(errs);
    if (hasErrors(errs)) {
      setAttempted(true);
      return focusFirstError();
    }
    setAttempted(false);
    setErrors({});
    setStep((s) => (s < 4 ? ((s + 1) as 2 | 3 | 4) : s));
  }

  async function save() {
    if (savingRef.current) return;
    const built = buildProfilePayload(form);
    if (!built.ok) {
      setErrors(built.errors);
      setAttempted(true);
      return focusFirstError();
    }
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await api.saveProfile(built.value);
      setTargets(res.targets);
    } catch (e) {
      setSaveError(e instanceof ApiError ? explainFailure(e) : 'We could not save your plan. Please try again.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const err = (k: keyof FieldErrors) => (errors[k] ? `${uid}-${k}-err` : undefined);
  const fieldProps = (k: keyof FieldErrors) => ({ 'aria-invalid': errors[k] ? (true as const) : undefined, 'aria-describedby': err(k) });
  const errText = (k: keyof FieldErrors) => (errors[k] ? <p className="error" id={`${uid}-${k}-err`}>{errors[k]}</p> : null);

  const cm = heightToCm(form);
  const kg = weightToKg(form, form.weight);
  const targetKg = weightToKg(form, form.target);
  const unitLabel = form.weightUnit;

  /* ---------------------------------------------------------- plan view */
  if (targets) {
    return (
      <div className="card stack">
        <h2 ref={headingRef} tabIndex={-1}>
          Your plan is ready
        </h2>
        <PlanCard targets={targets} />
        <p className="help">{DISCLAIMER}</p>
        <div className="actions">
          <span />
          <button
            className="btn btn-primary btn-big"
            onClick={() => {
              if (onDone) onDone();
              else router.replace('/dashboard');
            }}
          >
            {mode === 'onboarding' ? 'Go to my dashboard' : 'Done'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card" ref={formRef}>
      <ol className="stepper" aria-label="Progress">
        {[1, 2, 3, 4].map((n) => (
          <li key={n} className={n < step ? 'done' : ''} aria-current={n === step ? 'step' : undefined}>
            <span className="sr-only">
              Step {n}: {STEP_TITLES[n - 1]}
              {n < step ? ' (done)' : n === step ? ' (current)' : ''}
            </span>
          </li>
        ))}
      </ol>
      <p className="step-label">
        Step {step} of 4
      </p>
      <h2 ref={headingRef} tabIndex={-1}>
        {STEP_TITLES[step - 1]}
      </h2>

      {/* ---------------------------------------------- step 1 */}
      {step === 1 && (
        <div>
          <p className="muted">This helps us estimate how much energy your body uses. It stays private to you.</p>
          <fieldset>
            <legend>Sex</legend>
            <div className="choices cols" role="radiogroup" aria-label="Sex" {...fieldProps('sex')}>
              {(['female', 'male'] as const).map((s) => (
                <label key={s} className="choice">
                  <input type="radio" name={`${uid}-sex`} checked={form.sex === s} onChange={() => set('sex', s)} {...(errors.sex ? { 'aria-invalid': true } : {})} />
                  <span className="title">{s === 'female' ? 'Female' : 'Male'}</span>
                </label>
              ))}
            </div>
            <p className="help">Used only in the calorie estimate.</p>
            {errText('sex')}
          </fieldset>

          <div className="field">
            <label htmlFor={`${uid}-age`}>Age</label>
            <input id={`${uid}-age`} className="input" inputMode="numeric" autoComplete="off" value={form.age} onChange={(e) => set('age', e.target.value)} {...fieldProps('age')} />
            {errText('age')}
          </div>

          <fieldset>
            <legend>Height</legend>
            <div className="row" style={{ marginBottom: 8 }}>
              <div className="seg" role="radiogroup" aria-label="Height unit">
                {(['cm', 'ftin'] as const).map((u) => (
                  <label key={u}>
                    <input type="radio" name={`${uid}-hu`} checked={form.heightUnit === u} onChange={() => setForm((f) => switchHeightUnit(f, u))} />
                    {u === 'cm' ? 'cm' : 'ft / in'}
                  </label>
                ))}
              </div>
            </div>
            {form.heightUnit === 'cm' ? (
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor={`${uid}-hcm`} className="sr-only">
                  Height in centimeters
                </label>
                <input id={`${uid}-hcm`} className="input" inputMode="decimal" placeholder="e.g. 168" value={form.heightCm} onChange={(e) => set('heightCm', e.target.value)} {...fieldProps('height')} />
                {cm !== null && <p className="help">About {formatFtIn(cm)}</p>}
              </div>
            ) : (
              <div className="row">
                <div className="field" style={{ marginBottom: 0, flex: 1 }}>
                  <label htmlFor={`${uid}-hft`}>Feet</label>
                  <input id={`${uid}-hft`} className="input" inputMode="numeric" placeholder="5" value={form.heightFt} onChange={(e) => set('heightFt', e.target.value)} {...fieldProps('height')} />
                </div>
                <div className="field" style={{ marginBottom: 0, flex: 1 }}>
                  <label htmlFor={`${uid}-hin`}>Inches</label>
                  <input id={`${uid}-hin`} className="input" inputMode="decimal" placeholder="6" value={form.heightIn} onChange={(e) => set('heightIn', e.target.value)} {...fieldProps('height')} />
                </div>
                {cm !== null && <p className="help" style={{ flexBasis: '100%', margin: 0 }}>About {Math.round(cm)} cm</p>}
              </div>
            )}
            {errText('height')}
          </fieldset>

          <fieldset>
            <legend>Current weight</legend>
            <div className="row" style={{ marginBottom: 8 }}>
              <div className="seg" role="radiogroup" aria-label="Weight unit">
                {(['kg', 'lb'] as const).map((u) => (
                  <label key={u}>
                    <input type="radio" name={`${uid}-wu`} checked={form.weightUnit === u} onChange={() => setForm((f) => switchWeightUnit(f, u))} />
                    {u}
                  </label>
                ))}
              </div>
            </div>
            <label htmlFor={`${uid}-w`} className="sr-only">
              Current weight in {unitLabel === 'kg' ? 'kilograms' : 'pounds'}
            </label>
            <input id={`${uid}-w`} className="input" inputMode="decimal" placeholder={unitLabel === 'kg' ? 'e.g. 82' : 'e.g. 180'} value={form.weight} onChange={(e) => set('weight', e.target.value)} {...fieldProps('weight')} />
            {kg !== null && <p className="help">{form.weightUnit === 'kg' ? `About ${kgToLb(kg)} lb` : `About ${kg} kg`}</p>}
            {errText('weight')}
          </fieldset>

          <fieldset>
            <legend>How active are you in a normal week?</legend>
            <div className="choices" role="radiogroup" aria-label="Activity level" {...fieldProps('activity')}>
              {ACTIVITY.map((a) => (
                <label key={a.v} className="choice">
                  <input type="radio" name={`${uid}-act`} checked={form.activity === a.v} onChange={() => set('activity', a.v)} />
                  <span className="title">{a.t}</span>
                  <span className="desc">{a.d}</span>
                </label>
              ))}
            </div>
            {errText('activity')}
          </fieldset>
        </div>
      )}

      {/* ---------------------------------------------- step 2 */}
      {step === 2 && (
        <div>
          <p className="muted">Pick a target you feel good about. You can change it any time.</p>
          <fieldset>
            <legend>Target weight</legend>
            <div className="row" style={{ marginBottom: 8 }}>
              <div className="seg" role="radiogroup" aria-label="Weight unit">
                {(['kg', 'lb'] as const).map((u) => (
                  <label key={u}>
                    <input type="radio" name={`${uid}-wu2`} checked={form.weightUnit === u} onChange={() => setForm((f) => switchWeightUnit(f, u))} />
                    {u}
                  </label>
                ))}
              </div>
            </div>
            <label htmlFor={`${uid}-t`} className="sr-only">
              Target weight in {unitLabel === 'kg' ? 'kilograms' : 'pounds'}
            </label>
            <input id={`${uid}-t`} className="input" inputMode="decimal" value={form.target} onChange={(e) => set('target', e.target.value)} {...fieldProps('target')} />
            {errText('target')}
            {kg !== null && targetKg !== null && (
              <p className="help" aria-live="polite">
                {targetKg < kg
                  ? `That is about ${(Math.round((kg - targetKg) * 10) / 10)} kg (${kgToLb(kg - targetKg)} lb) from where you are now.`
                  : 'This is not below your current weight, so your plan will aim to keep you steady.'}
              </p>
            )}
          </fieldset>

          <fieldset>
            <legend>How fast would you like to go?</legend>
            <div className="choices" role="radiogroup" aria-label="Pace" {...fieldProps('pace')}>
              {PACES.map((p) => (
                <label key={p.v} className="choice">
                  <input type="radio" name={`${uid}-pace`} checked={form.pace === p.v} onChange={() => set('pace', p.v)} />
                  <span className="title">
                    {p.t}: {formatPace(PACE_KG[p.v])} a week
                  </span>
                  <span className="desc">{p.d}</span>
                </label>
              ))}
            </div>
            {errText('pace')}
          </fieldset>
          <p className="help">On the last step we calculate your real daily plan.</p>
        </div>
      )}

      {/* ---------------------------------------------- step 3 */}
      {step === 3 && (
        <div>
          <p className="muted">We use this to flag foods that do not fit you. Both parts are optional.</p>
          <fieldset>
            <legend>Do you follow a diet?</legend>
            <div className="choices cols" role="radiogroup" aria-label="Diet" {...fieldProps('diet')}>
              {DIETS.map((d) => (
                <label key={d.v} className="choice">
                  <input type="radio" name={`${uid}-diet`} checked={form.diet === d.v} onChange={() => set('diet', d.v)} />
                  <span className="title">{d.t}</span>
                </label>
              ))}
            </div>
            {errText('diet')}
          </fieldset>
          <fieldset>
            <legend>Any allergies or foods to avoid?</legend>
            <div className="choices cols">
              {ALLERGENS.map((a) => (
                <label key={a.v} className="choice">
                  <input
                    type="checkbox"
                    checked={form.allergens.includes(a.v)}
                    onChange={(e) => set('allergens', e.target.checked ? [...form.allergens, a.v] : form.allergens.filter((x) => x !== a.v))}
                  />
                  <span className="title">{a.t}</span>
                </label>
              ))}
            </div>
            {errText('allergens')}
          </fieldset>
        </div>
      )}

      {/* ---------------------------------------------- step 4 */}
      {step === 4 && (
        <div>
          <dl className="summary">
            <dt>Sex</dt>
            <dd>{form.sex}</dd>
            <dt>Age</dt>
            <dd>{form.age}</dd>
            <dt>Height</dt>
            <dd>{cm !== null ? `${Math.round(cm)} cm (${formatFtIn(cm)})` : ''}</dd>
            <dt>Weight</dt>
            <dd>{kg !== null ? `${kg} kg (${kgToLb(kg)} lb)` : ''}</dd>
            <dt>Target</dt>
            <dd>{targetKg !== null ? `${targetKg} kg (${kgToLb(targetKg)} lb)` : ''}</dd>
            <dt>Activity</dt>
            <dd>{ACTIVITY.find((a) => a.v === form.activity)?.t}</dd>
            <dt>Pace</dt>
            <dd>{form.pace ? `${form.pace}, ${formatPace(PACE_KG[form.pace])} a week` : ''}</dd>
            <dt>Diet</dt>
            <dd>{DIETS.find((d) => d.v === form.diet)?.t}</dd>
            <dt>Avoiding</dt>
            <dd>{form.allergens.length ? form.allergens.map((a) => ALLERGENS.find((x) => x.v === a)?.t ?? a).join(', ') : 'Nothing'}</dd>
          </dl>
          <div className="notice">
            <label className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap', cursor: 'pointer' }}>
              <input
                type="checkbox"
                style={{ width: 22, height: 22, marginTop: 2, accentColor: 'var(--primary)', flexShrink: 0 }}
                checked={form.accepted}
                onChange={(e) => set('accepted', e.target.checked)}
                {...fieldProps('accepted')}
              />
              <span>{DISCLAIMER}</span>
            </label>
          </div>
          {errText('accepted')}
        </div>
      )}

      <div aria-live="assertive">{saveError && <p className="alert" style={{ marginTop: 14 }}>{saveError}</p>}</div>

      <div className="actions">
        <button className="btn" type="button" onClick={() => {
            setAttempted(false);
            setErrors({});
            setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s));
          }} disabled={step === 1 || saving}>
          Back
        </button>
        {step < 4 ? (
          <button className="btn btn-primary" type="button" onClick={next}>
            Next
          </button>
        ) : (
          <button className="btn btn-primary" type="button" onClick={save} disabled={!form.accepted || saving}>
            {saving ? (
              <>
                <span className="spinner" aria-hidden="true" /> Building your plan…
              </>
            ) : (
              'Create my plan'
            )}
          </button>
        )}
      </div>
    </div>
  );
}
