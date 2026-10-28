'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DaySummary, MealRecord } from '@leanplate/contracts';
import { api, ApiError } from '@/lib/api';
import { greeting, localDate, tzOffset } from '@/lib/dates';
import { explainFailure } from '@/lib/errors-ui';
import { CalorieRing, MacroBar, WeekChart } from './charts';
import { MealList } from './MealList';

export function Dashboard({ name }: { name: string }) {
  const [summary, setSummary] = useState<DaySummary | null>(null);
  const [meals, setMeals] = useState<MealRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [today, setToday] = useState('');
  const [hello, setHello] = useState('Hello');
  const [status, setStatus] = useState('');
  const alive = useRef(true);

  const load = useCallback(async () => {
    const date = localDate();
    const tz = tzOffset();
    setToday(date);
    setError(null);
    try {
      const [s, m] = await Promise.all([api.summary(date, tz), api.meals(date, tz)]);
      if (!alive.current) return;
      setSummary(s);
      setMeals(m.meals);
    } catch (e) {
      if (alive.current && !(e instanceof ApiError && e.status === 401)) setError(e instanceof ApiError ? explainFailure(e) : 'We could not load your day.');
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    setHello(greeting());
    load();
    return () => {
      alive.current = false;
    };
  }, [load]);

  async function remove(id: string) {
    try {
      await api.deleteMeal(id);
      setStatus('Meal deleted.');
      await load();
    } catch (e) {
      setStatus(e instanceof ApiError ? explainFailure(e) : 'We could not delete that meal.');
    }
  }

  return (
    <div className="stack">
      <div className="row between">
        <div>
          <h1 style={{ marginBottom: 4 }}>
            {hello}
            {name ? `, ${name}` : ''}
          </h1>
          <p className="muted" style={{ margin: 0 }}>
            Here is how today is going.
          </p>
        </div>
        <Link href="/meals/new" className="btn btn-primary btn-big">
          + Add a meal
        </Link>
      </div>

      <div role="status" aria-live="polite" className="sr-only">
        {status}
      </div>
      {error && (
        <div className="alert" role="alert">
          {error}{' '}
          <button className="btn btn-small" onClick={load}>
            Try again
          </button>
        </div>
      )}

      {!summary && !error && (
        <div className="grid-2" aria-busy="true" aria-label="Loading your day">
          <div className="skeleton" style={{ height: 280 }} />
          <div className="skeleton" style={{ height: 280 }} />
        </div>
      )}

      {summary && (
        <>
          <div className="grid-2">
            <section className="card" aria-labelledby="cal-h">
              <h2 id="cal-h">Calories today</h2>
              <CalorieRing consumed={summary.consumed.kcal} target={summary.targets.dailyKcal} />
            </section>
            <section className="card" aria-labelledby="mac-h">
              <h2 id="mac-h">Nutrients today</h2>
              <MacroBar label="Protein" kind="goal" value={summary.consumed.proteinG} goal={summary.targets.proteinG} />
              <MacroBar label="Fiber" kind="goal" value={summary.consumed.fiberG} goal={summary.targets.fiberG} />
              <MacroBar label="Sugar" kind="cap" value={summary.consumed.sugarG} goal={summary.targets.sugarCapG} />
            </section>
          </div>

          <section className="card" aria-labelledby="meals-h">
            <div className="row between">
              <h2 id="meals-h" style={{ marginBottom: 0 }}>
                Today&apos;s meals
              </h2>
              {summary.mealCount > 0 && (
                <span className="muted small">
                  {summary.onTrackCount} of {summary.mealCount} on track
                </span>
              )}
            </div>
            <div style={{ marginTop: 12 }}>
              {meals && meals.length > 0 ? (
                <MealList meals={meals} onDelete={remove} />
              ) : (
                <div className="empty">
                  <p>Nothing logged yet today. A photo or a few words is all it takes.</p>
                  <Link href="/meals/new" className="btn btn-primary">
                    Log your first meal
                  </Link>
                </div>
              )}
            </div>
          </section>

          <section className="card" aria-labelledby="week-h">
            <h2 id="week-h">Your last 7 days</h2>
            {summary.week.every((d) => d.kcal === 0) ? (
              <p className="muted">Once you log a few meals, your week will show up here.</p>
            ) : (
              <WeekChart week={summary.week} target={summary.targets.dailyKcal} today={today} />
            )}
          </section>
        </>
      )}
    </div>
  );
}
