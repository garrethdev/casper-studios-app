'use client';

import { useState } from 'react';
import type { MealRecord } from '@leanplate/contracts';
import { timeLabel } from '@/lib/dates';
import { VerdictBadge } from './VerdictBadge';

export function summarizeItems(items: { name: string }[], max = 3): string {
  const names = items.map((i) => i.name);
  if (names.length <= max) return names.join(', ');
  return `${names.slice(0, max).join(', ')} and ${names.length - max} more`;
}

export function MealList({ meals, onDelete }: { meals: MealRecord[]; onDelete: (id: string) => Promise<void> }) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  return (
    <ul className="meal-list">
      {meals.map((m) => (
        <li key={m.id} className="meal">
          <div className="head">
            <span>
              <span className="type">{m.mealType}</span> <span className="muted small">{timeLabel(m.eatenAt)}</span>
            </span>
            <VerdictBadge label={m.verdict.label} />
          </div>
          <div>{summarizeItems(m.items)}</div>
          <div className="row between">
            <span className="muted small">
              {Math.round(m.totals.kcal)} kcal · {Math.round(m.totals.proteinG)} g protein
            </span>
            {confirming === m.id ? (
              <span className="row" role="group" aria-label={`Confirm deleting ${m.mealType}`}>
                <span className="small">Delete this meal?</span>
                <button
                  className="btn btn-small btn-danger"
                  disabled={busy === m.id}
                  onClick={async () => {
                    setBusy(m.id);
                    try {
                      await onDelete(m.id);
                    } finally {
                      setBusy(null);
                      setConfirming(null);
                    }
                  }}
                >
                  Yes, delete
                </button>
                <button className="btn btn-small" onClick={() => setConfirming(null)} autoFocus>
                  Keep it
                </button>
              </span>
            ) : (
              <button className="btn btn-small btn-quiet" onClick={() => setConfirming(m.id)} aria-label={`Delete ${m.mealType} at ${timeLabel(m.eatenAt)}`}>
                Delete
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
