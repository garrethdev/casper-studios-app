'use client';

import Link from 'next/link';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { AnalyzeMealResult, Feedback, MealRecord, Verdict } from '@leanplate/contracts';
import { api, ApiError } from '@/lib/api';
import { localDate, tzOffset } from '@/lib/dates';
import { explainFailure } from '@/lib/errors-ui';
import { prepareImage, type PreparedImage } from '@/lib/image';
import { MEAL_TYPES, defaultMealType, type MealTypeName } from '@/lib/meal-type';
import {
  emptyManual,
  makeRows,
  newIdempotencyKey,
  parseGrams,
  parseManualItem,
  removeRow,
  rowsToItems,
  setGrams,
  totalsOf,
  type ManualForm,
  type Row,
} from '@/lib/meal-edit';
import { VerdictBadge } from './VerdictBadge';

type Phase = 'compose' | 'analyzing' | 'edit' | 'saved';

const fmt = (n: number) => Math.round(n).toLocaleString();

function ScoreRing({ score }: { score: number }) {
  const R = 38;
  const C = 2 * Math.PI * R;
  const s = Math.max(0, Math.min(100, score));
  return (
    <svg className="score-ring" viewBox="0 0 92 92" role="img" aria-label={`Score ${Math.round(s)} out of 100`}>
      <circle cx="46" cy="46" r={R} fill="none" strokeWidth="9" className="ring-track" />
      <circle cx="46" cy="46" r={R} fill="none" strokeWidth="9" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - s / 100)} transform="rotate(-90 46 46)" className="ring-bar" />
      <text x="46" y="52" textAnchor="middle" fontSize="22">
        {Math.round(s)}
      </text>
    </svg>
  );
}

function VerdictCard({ verdict, dim, title }: { verdict: Verdict; dim?: boolean; title: string }) {
  return (
    <section className={`card${dim ? ' dim' : ''}`} aria-label={title}>
      <div className="verdict">
        <ScoreRing score={verdict.score} />
        <div>
          <h3 style={{ marginBottom: 6 }}>{title}</h3>
          <VerdictBadge label={verdict.label} />
        </div>
      </div>
      {verdict.reasons.length > 0 && (
        <ul className="reasons">
          {verdict.reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}
      <div className="facts">
        <div className="fact">
          <div className="n">{fmt(verdict.mealBudgetKcal)}</div>
          <div className="l">kcal planned for this meal</div>
        </div>
        <div className="fact">
          <div className="n">{fmt(verdict.projectedDayKcal)}</div>
          <div className="l">kcal projected for today</div>
        </div>
        <div className="fact">
          <div className="n">{fmt(verdict.remainingAfterKcal)}</div>
          <div className="l">kcal left after this</div>
        </div>
      </div>
    </section>
  );
}

function FeedbackCard({ feedback }: { feedback: Feedback }) {
  return (
    <section className="card" aria-label="Tips">
      <h3>{feedback.headline}</h3>
      {feedback.tips.length > 0 && (
        <ul>
          {feedback.tips.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      )}
      {feedback.citations.length > 0 && (
        <details className="why">
          <summary>Why we say this</summary>
          <ul>
            {feedback.citations.map((c) => (
              <li key={c.id}>
                <strong>{c.title}.</strong> {c.snippet}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

export function MealComposer() {
  const uid = useId();
  const [phase, setPhase] = useState<Phase>('compose');
  const [mealType, setMealType] = useState<MealTypeName>('lunch');
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<PreparedImage | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeMealResult | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [edited, setEdited] = useState(false);
  const [gramsText, setGramsText] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<MealRecord | null>(null);
  const [manual, setManual] = useState<ManualForm>(emptyManual);
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const savingRef = useRef(false);
  const keyRef = useRef<string>('');
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMealType(defaultMealType());
    keyRef.current = newIdempotencyKey();
    return () => abortRef.current?.abort();
  }, []);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  useEffect(() => {
    return () => {
      if (photo) URL.revokeObjectURL(photo.previewUrl);
    };
  }, [photo]);
  useEffect(() => {
    if (phase === 'edit' || phase === 'saved') resultRef.current?.focus();
  }, [phase]);

  const totals = useMemo(() => totalsOf(rows), [rows]);

  // A changed meal is a different request, so it gets a fresh idempotency key. Pressing Save twice on the
  // same content reuses the key, which is what lets the server ignore the repeat.
  useEffect(() => {
    if (phase === 'edit') keyRef.current = newIdempotencyKey();
  }, [phase, rows, note, mealType]);
  const canAnalyze = (photo !== null || text.trim().length > 1) && !photoBusy;

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setPhotoBusy(true);
    try {
      const prepared = await prepareImage(file);
      setPhoto((old) => {
        if (old) URL.revokeObjectURL(old.previewUrl);
        return prepared;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'We could not read that photo.');
    } finally {
      setPhotoBusy(false);
    }
  }

  async function analyze() {
    if (phase === 'analyzing' || !canAnalyze) return;
    setError(null);
    setInfo(null);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setPhase('analyzing');
    try {
      const res = await api.analyze(
        {
          mealType,
          image: photo ? { mediaType: photo.mediaType, dataBase64: photo.dataBase64 } : undefined,
          text: text.trim().length > 1 ? text.trim() : undefined,
          tzOffsetMinutes: tzOffset(),
          date: localDate(),
        },
        ctrl.signal,
      );
      setResult(res);
      setRows(makeRows(res.analysis.items));
      setGramsText({});
      setEdited(false);
      keyRef.current = newIdempotencyKey();
      setPhase('edit');
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        setInfo('Analysis cancelled. Nothing was saved.');
      } else if (!(e instanceof ApiError && e.status === 401)) {
        setError(e instanceof ApiError ? explainFailure(e, 'analyze') : 'Something went wrong. Please try again.');
      }
      setPhase('compose');
    } finally {
      abortRef.current = null;
    }
  }

  function changeGrams(key: string, value: string) {
    setGramsText((g) => ({ ...g, [key]: value }));
    const grams = parseGrams(value);
    if (grams !== null) {
      setRows((r) => setGrams(r, key, grams));
      setEdited(true);
    }
  }

  function addManual() {
    const parsed = parseManualItem(manual);
    if (!parsed.ok) {
      setManualError(parsed.error);
      return;
    }
    if (rows.length >= 20) {
      setManualError('A meal can have up to 20 foods.');
      return;
    }
    setRows((r) => [...r, ...makeRows([parsed.item])]);
    setManual(emptyManual());
    setManualError(null);
    setManualOpen(false);
    setEdited(true);
    setInfo(`${parsed.item.name} added.`);
  }

  async function save() {
    if (savingRef.current || rows.length === 0) return;
    savingRef.current = true; // blocks a second click before React re-renders
    setSaving(true);
    setError(null);
    try {
      const res = await api.saveMeal({
        mealType,
        eatenAt: new Date().toISOString(),
        items: rowsToItems(rows),
        note: note.trim() || undefined,
        idempotencyKey: keyRef.current,
        tzOffsetMinutes: tzOffset(),
      });
      setSaved(res.meal);
      setPhase('saved');
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) setError(e instanceof ApiError ? explainFailure(e, 'save') : 'We could not save that meal. Please try again.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function reset() {
    setPhase('compose');
    setText('');
    setPhoto(null);
    setResult(null);
    setRows([]);
    setSaved(null);
    setNote('');
    setInfo(null);
    setError(null);
    setEdited(false);
    setMealType(defaultMealType());
    keyRef.current = newIdempotencyKey();
  }

  /* ------------------------------------------------------------ saved */
  if (phase === 'saved' && saved) {
    return (
      <div className="stack">
        <h1 ref={resultRef} tabIndex={-1}>
          Meal saved
        </h1>
        <VerdictCard verdict={saved.verdict} title="How this meal fits your plan" />
        {saved.feedback && <FeedbackCard feedback={saved.feedback} />}
        <div className="row">
          <Link href="/dashboard" className="btn btn-primary">
            Back to today
          </Link>
          <button className="btn" onClick={reset}>
            Add another meal
          </button>
        </div>
      </div>
    );
  }

  const live = (
    <div aria-live="polite" role="status" className="sr-only">
      {phase === 'analyzing' ? 'Analyzing your meal' : info}
    </div>
  );
  const errorBox = (
    <div ref={errorRef} tabIndex={-1} aria-live="assertive" role="alert">
      {error && <p className="alert">{error}</p>}
    </div>
  );

  /* ------------------------------------------------------------ edit */
  if (phase === 'edit' && result) {
    return (
      <div className="stack">
        {live}
        <h1 ref={resultRef} tabIndex={-1}>
          Check your meal
        </h1>
        <p className="muted">Fix anything that looks off. Your changes update the totals right away.</p>

        <VerdictCard verdict={result.verdict} title={edited ? 'First look at this meal' : 'How this meal looks'} dim={edited} />
        <p className="help" role="note">
          Final score is calculated when you save.
        </p>

        {(result.analysis.warnings.length > 0 || rows.some((r) => r.item.needsReview)) && (
          <div className="chips" aria-label="Things to double-check">
            {result.analysis.warnings.map((w, i) => (
              <span key={i} className="chip warn">
                ⚠ {w}
              </span>
            ))}
          </div>
        )}

        <section className="card" aria-labelledby={`${uid}-bd`}>
          <h2 id={`${uid}-bd`}>Breakdown</h2>
          {rows.length === 0 ? (
            <p className="muted">Every food was removed. Add a food below, or start again.</p>
          ) : (
            <div className="table-wrap">
              <table className="items">
                <caption className="sr-only">Foods in this meal. Change the grams to rescale a food.</caption>
                <thead>
                  <tr>
                    <th scope="col">Food</th>
                    <th scope="col">Grams</th>
                    <th scope="col" className="num">kcal</th>
                    <th scope="col" className="num">Protein</th>
                    <th scope="col" className="num">Carbs</th>
                    <th scope="col" className="num">Fat</th>
                    <th scope="col"><span className="sr-only">Remove</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const gt = gramsText[r.key] ?? String(r.item.grams);
                    const bad = gramsText[r.key] !== undefined && parseGrams(gt) === null;
                    return (
                      <tr key={r.key}>
                        <td className="name" data-label="Food">
                          {r.item.name}
                          <div className="chips" style={{ marginTop: 4 }}>
                            {r.item.needsReview && <span className="chip warn">Please check this one</span>}
                            {r.item.source === 'user' && <span className="chip">Added by you</span>}
                            {r.item.allergens.length > 0 && <span className="chip alert-chip">Contains {r.item.allergens.join(', ')}</span>}
                          </div>
                        </td>
                        <td data-label="Grams">
                          <label className="sr-only" htmlFor={`${uid}-g-${r.key}`}>
                            Grams of {r.item.name}
                          </label>
                          <input
                            id={`${uid}-g-${r.key}`}
                            className="input grams"
                            inputMode="decimal"
                            value={gt}
                            onChange={(e) => changeGrams(r.key, e.target.value)}
                            onBlur={() => setGramsText((g) => { const { [r.key]: _drop, ...rest } = g; return rest; })}
                            aria-invalid={bad || undefined}
                            aria-describedby={bad ? `${uid}-ge-${r.key}` : undefined}
                          />
                          {bad && (
                            <div className="error small" id={`${uid}-ge-${r.key}`}>
                              1 to 2000
                            </div>
                          )}
                        </td>
                        <td className="num" data-label="kcal">{fmt(r.item.kcal)}</td>
                        <td className="num" data-label="Protein">{r.item.proteinG} g</td>
                        <td className="num" data-label="Carbs">{r.item.carbsG} g</td>
                        <td className="num" data-label="Fat">{r.item.fatG} g</td>
                        <td data-label="">
                          <button
                            className="btn btn-small btn-quiet"
                            onClick={() => {
                              setRows((x) => removeRow(x, r.key));
                              setEdited(true);
                              setInfo(`${r.item.name} removed.`);
                            }}
                            aria-label={`Remove ${r.item.name}`}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="name" data-label="Total">Total</td>
                    <td className="hide-sm"></td>
                    <td className="num" data-label="kcal" aria-live="polite">{fmt(totals.kcal)}</td>
                    <td className="num" data-label="Protein">{totals.proteinG} g</td>
                    <td className="num" data-label="Carbs">{totals.carbsG} g</td>
                    <td className="num" data-label="Fat">{totals.fatG} g</td>
                    <td className="hide-sm"></td>
                  </tr>
                  <tr>
                    <td className="name hide-sm"></td>
                    <td className="hide-sm"></td>
                    <td colSpan={5} className="help" style={{ textAlign: 'right' }}>
                      Fiber {totals.fiberG} g · Sugar {totals.sugarG} g
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <details open={manualOpen} onToggle={(e) => setManualOpen((e.currentTarget as HTMLDetailsElement).open)} className="why">
            <summary>Add a food that is missing</summary>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                addManual();
              }}
              className="stack"
              style={{ marginTop: 12 }}
              noValidate
            >
              <div className="grid-2">
                <div className="field">
                  <label htmlFor={`${uid}-m-name`}>Food name</label>
                  <input id={`${uid}-m-name`} className="input" maxLength={80} value={manual.name} onChange={(e) => setManual({ ...manual, name: e.target.value })} />
                </div>
                <div className="field">
                  <label htmlFor={`${uid}-m-grams`}>Weight (grams)</label>
                  <input id={`${uid}-m-grams`} className="input" inputMode="decimal" value={manual.grams} onChange={(e) => setManual({ ...manual, grams: e.target.value })} />
                </div>
              </div>
              <p className="help">Numbers for the whole portion. Leave a box empty for zero.</p>
              <div className="grid-2">
                {(
                  [
                    ['kcal', 'Calories (kcal)'],
                    ['proteinG', 'Protein (g)'],
                    ['carbsG', 'Carbs (g)'],
                    ['fatG', 'Fat (g)'],
                    ['fiberG', 'Fiber (g)'],
                    ['sugarG', 'Sugar (g)'],
                  ] as const
                ).map(([k, label]) => (
                  <div className="field" key={k}>
                    <label htmlFor={`${uid}-m-${k}`}>{label}</label>
                    <input id={`${uid}-m-${k}`} className="input" inputMode="decimal" value={manual[k]} onChange={(e) => setManual({ ...manual, [k]: e.target.value })} />
                  </div>
                ))}
              </div>
              <div aria-live="assertive">{manualError && <p className="error">{manualError}</p>}</div>
              <button type="submit" className="btn">
                Add this food
              </button>
            </form>
          </details>
        </section>

        <div className="field">
          <label htmlFor={`${uid}-note`}>Note (optional)</label>
          <input id={`${uid}-note`} className="input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>

        {errorBox}
        <div className="row">
          <button className="btn btn-primary btn-big" onClick={save} disabled={saving || rows.length === 0}>
            {saving ? (
              <>
                <span className="spinner" aria-hidden="true" /> Saving…
              </>
            ) : (
              'Save meal'
            )}
          </button>
          <button className="btn" onClick={reset} disabled={saving}>
            Start over
          </button>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------ compose / analyzing */
  const analyzing = phase === 'analyzing';
  return (
    <div className="stack">
      {live}
      <div>
        <h1>Add a meal</h1>
        <p className="muted">Take a photo, describe it in words, or both. You can fix anything before saving.</p>
      </div>

      <fieldset disabled={analyzing}>
        <legend>Which meal is this?</legend>
        <div className="seg" role="radiogroup" aria-label="Meal type" style={{ flexWrap: 'wrap' }}>
          {MEAL_TYPES.map((m) => (
            <label key={m.v}>
              <input type="radio" name={`${uid}-mt`} checked={mealType === m.v} onChange={() => setMealType(m.v)} />
              {m.t}
            </label>
          ))}
        </div>
      </fieldset>

      <section className="card" aria-labelledby={`${uid}-ph`}>
        <h2 id={`${uid}-ph`}>Photo</h2>
        <div className="photo-box">
          {photo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo.previewUrl} alt="Preview of the photo you chose" width={photo.width} height={photo.height} />
          )}
          <div className="row">
            <button type="button" className="btn" onClick={() => cameraRef.current?.click()} disabled={analyzing || photoBusy}>
              {photoBusy ? 'Preparing photo…' : photo ? 'Take another photo' : 'Take a photo'}
            </button>
            <button type="button" className="btn" onClick={() => libraryRef.current?.click()} disabled={analyzing || photoBusy}>
              Choose from library
            </button>
            {photo && (
              <button type="button" className="btn btn-quiet" onClick={() => setPhoto(null)} disabled={analyzing}>
                Remove photo
              </button>
            )}
          </div>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} aria-label="Take a photo of your meal" />
          <input ref={libraryRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} aria-label="Choose a photo of your meal" />
          <p className="help" style={{ margin: 0 }}>
            Photos are shrunk on your device before they are sent, and location data is removed. We never save the photo.
          </p>
        </div>
      </section>

      <div className="field">
        <label htmlFor={`${uid}-text`}>Describe it (optional with a photo)</label>
        <textarea
          id={`${uid}-text`}
          maxLength={600}
          value={text}
          disabled={analyzing}
          placeholder="e.g. two scrambled eggs, a slice of wholegrain toast and half an avocado"
          onChange={(e) => setText(e.target.value)}
          aria-describedby={`${uid}-count`}
        />
        <div className="help" id={`${uid}-count`}>
          {text.length} of 600 characters
        </div>
      </div>

      {errorBox}
      {info && !error && <p className="notice">{info}</p>}

      <div className="row">
        <button className="btn btn-primary btn-big" onClick={analyze} disabled={!canAnalyze || analyzing}>
          {analyzing ? (
            <>
              <span className="spinner" aria-hidden="true" /> Analyzing…
            </>
          ) : (
            'Analyze'
          )}
        </button>
        {analyzing && (
          <button className="btn" onClick={() => abortRef.current?.abort()}>
            Cancel
          </button>
        )}
      </div>
      {!canAnalyze && !analyzing && <p className="help">Add a photo or a short description to continue.</p>}
    </div>
  );
}
