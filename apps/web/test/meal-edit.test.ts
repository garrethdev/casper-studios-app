import { describe, expect, it } from 'vitest';
import type { FoodItem } from '@leanplate/contracts';
import { emptyManual, makeRows, newIdempotencyKey, parseGrams, parseManualItem, removeRow, rowsToItems, setGrams, totalsOf } from '../lib/meal-edit';

const rice: FoodItem = { name: 'Rice', grams: 100, kcal: 130, proteinG: 2.7, carbsG: 28, fatG: 0.3, fiberG: 0.4, sugarG: 0.1, confidence: 0.9, source: 'knowledge-base', allergens: [], needsReview: false };
const egg: FoodItem = { name: 'Egg', grams: 50, kcal: 72, proteinG: 6.3, carbsG: 0.4, fatG: 4.8, fiberG: 0, sugarG: 0.2, confidence: 0.8, source: 'vision', allergens: ['egg'], needsReview: true };

describe('meal editing', () => {
  it('editing grams rescales from the original, so there is no rounding drift', () => {
    let rows = makeRows([rice]);
    const key = rows[0]!.key;
    rows = setGrams(rows, key, 250);
    expect(rows[0]!.item).toMatchObject({ grams: 250, kcal: 325, proteinG: 6.8 });
    rows = setGrams(rows, key, 100);
    expect(rows[0]!.item).toEqual(rice);
  });

  it('totals follow the rows and removal works', () => {
    let rows = makeRows([rice, egg]);
    expect(totalsOf(rows).kcal).toBe(202);
    rows = removeRow(rows, rows[1]!.key);
    expect(rowsToItems(rows)).toEqual([rice]);
    expect(totalsOf(rows).kcal).toBe(130);
    expect(totalsOf([])).toMatchObject({ kcal: 0, proteinG: 0 });
  });

  it('parseGrams accepts 1..2000 and nothing else', () => {
    expect(parseGrams('120')).toBe(120);
    expect(parseGrams('12,5')).toBe(12.5);
    for (const bad of ['', '0', '2001', '-3', 'abc', '1e2', '12.55']) expect(parseGrams(bad)).toBeNull();
  });

  it('manual item: valid entry becomes a source "user" item', () => {
    const r = parseManualItem({ ...emptyManual(), name: ' Olive oil ', grams: '10', kcal: '88', fatG: '10' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.item).toMatchObject({ name: 'Olive oil', grams: 10, kcal: 88, fatG: 10, proteinG: 0, source: 'user', needsReview: false, allergens: [] });
  });

  it('manual item: rejects nonsense with a readable message', () => {
    const base = { ...emptyManual(), name: 'Thing', grams: '100', kcal: '100', carbsG: '20' };
    expect(parseManualItem({ ...base, name: '  ' })).toMatchObject({ ok: false });
    expect(parseManualItem({ ...base, grams: '0' })).toMatchObject({ ok: false });
    expect(parseManualItem({ ...base, grams: '' })).toMatchObject({ ok: false });
    expect(parseManualItem({ ...base, kcal: '' })).toMatchObject({ ok: false });
    expect(parseManualItem({ ...base, kcal: 'lots' })).toMatchObject({ ok: false });
    expect(parseManualItem({ ...base, kcal: '2000' })).toMatchObject({ ok: false }); // 20 kcal/g
    expect(parseManualItem({ ...base, fiberG: '30' })).toMatchObject({ ok: false }); // more fiber than carbs
    expect(parseManualItem({ ...base, proteinG: '90', carbsG: '90' })).toMatchObject({ ok: false }); // heavier than the food
  });

  it('idempotency keys are unique and fit the server alphabet', () => {
    const a = newIdempotencyKey();
    expect(a).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(newIdempotencyKey()).not.toBe(a);
  });
});
