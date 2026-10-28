import { FoodItem, scaleItem, sumTotals, type Totals } from '@leanplate/contracts';

/**
 * Editing model for the breakdown table. Every row keeps its original `base` item, and a new portion is
 * always scaled from that base. Scaling the already-scaled item again would pile up rounding error
 * (100 g -> 200 g -> 100 g would not come back to the same calories).
 */
export interface Row {
  key: string;
  base: FoodItem;
  item: FoodItem;
}

let counter = 0;
const nextKey = () => `row-${++counter}`;

export const makeRows = (items: FoodItem[]): Row[] => items.map((item) => ({ key: nextKey(), base: item, item }));
export const rowsToItems = (rows: Row[]) => rows.map((r) => r.item);
export const totalsOf = (rows: Row[]): Totals => sumTotals(rowsToItems(rows));

export const GRAMS_MIN = 1;
export const GRAMS_MAX = 2000;

export function parseGrams(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!/^\d{1,4}(\.\d)?$/.test(t)) return null;
  const n = Number(t);
  return n >= GRAMS_MIN && n <= GRAMS_MAX ? n : null;
}

export function setGrams(rows: Row[], key: string, grams: number): Row[] {
  return rows.map((r) => (r.key === key ? { ...r, item: scaleItem(r.base, grams) } : r));
}

export const removeRow = (rows: Row[], key: string) => rows.filter((r) => r.key !== key);

/* ----- manual item form ----- */
export interface ManualForm {
  name: string;
  grams: string;
  kcal: string;
  proteinG: string;
  carbsG: string;
  fatG: string;
  fiberG: string;
  sugarG: string;
}
export const emptyManual = (): ManualForm => ({ name: '', grams: '', kcal: '', proteinG: '', carbsG: '', fatG: '', fiberG: '', sugarG: '' });

const num = (t: string): number | null => {
  const s = t.trim().replace(',', '.');
  if (s === '') return 0; // blank macro means none
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(s)) return null;
  return Number(s);
};

export type ManualResult = { ok: true; item: FoodItem } | { ok: false; error: string };

export function parseManualItem(f: ManualForm): ManualResult {
  const name = f.name.trim();
  if (!name) return { ok: false, error: 'Give the food a name.' };
  if (name.length > 80) return { ok: false, error: 'Keep the name under 80 characters.' };
  const grams = f.grams.trim() === '' ? null : num(f.grams);
  if (grams === null || grams < GRAMS_MIN || grams > GRAMS_MAX) return { ok: false, error: 'Enter the weight in grams, between 1 and 2000.' };
  const vals = { kcal: num(f.kcal), proteinG: num(f.proteinG), carbsG: num(f.carbsG), fatG: num(f.fatG), fiberG: num(f.fiberG), sugarG: num(f.sugarG) };
  for (const [k, v] of Object.entries(vals)) if (v === null) return { ok: false, error: `Check the number for ${k.replace('G', '').replace('kcal', 'calories')}.` };
  const v = vals as Record<keyof typeof vals, number>;
  if (f.kcal.trim() === '') return { ok: false, error: 'Enter the calories for this portion.' };
  if (v.fiberG > v.carbsG || v.sugarG > v.carbsG) return { ok: false, error: 'Fiber and sugar are part of the carbs, so they cannot be larger than the carbs.' };
  if (v.proteinG + v.carbsG + v.fatG > grams * 1.02) return { ok: false, error: 'The nutrients add up to more than the weight of the food. Check the numbers.' };
  if (v.kcal / grams > 9.5) return { ok: false, error: 'That is more calories than any food has for its weight. Check the numbers.' };
  const parsed = FoodItem.safeParse({ name, grams, ...v, confidence: 1, source: 'user', allergens: [], needsReview: false });
  if (!parsed.success) return { ok: false, error: 'Some numbers are outside the allowed range.' };
  return { ok: true, item: parsed.data };
}

/** Random key the server uses to ignore a repeated save. Works outside secure contexts too. */
export function newIdempotencyKey(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}
