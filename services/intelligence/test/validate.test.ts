import { describe, expect, it } from 'vitest';
import { AppError } from '@leanplate/security';
import { LIMITS, NOT_FOOD_MESSAGE, atwaterKcal, kcalAgrees, parseDetection, validateItems } from '../src/application/validate';
import type { WorkingItem } from '../src/domain/detection';

const omni = { vegan: false, vegetarian: false, pescatarian: false };
const plant = { vegan: true, vegetarian: true, pescatarian: true };

const item = (over: Partial<WorkingItem> = {}): WorkingItem => ({
  name: 'Chicken breast',
  grams: 150,
  kcal: 248,
  proteinG: 46.5,
  carbsG: 0,
  fatG: 5.4,
  fiberG: 0,
  sugarG: 0,
  confidence: 0.9,
  source: 'vision',
  allergens: [],
  needsReview: false,
  diet: omni,
  ...over,
});

const ctx = { allergens: [], diet: 'none' as const };

function err(fn: () => unknown): AppError {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(AppError);
    return e as AppError;
  }
  throw new Error('expected an AppError');
}

describe('strict detection parsing', () => {
  const good = { isFood: true, items: [{ name: 'Apple', grams: 180, kcal: 94, proteinG: 0.5, carbsG: 25, fatG: 0.3, fiberG: 4, sugarG: 19, confidence: 0.9 }], notes: '' };

  it('accepts a well-formed detection', () => {
    expect(parseDetection(good).items).toHaveLength(1);
  });

  it('rejects non-food with the friendly message', () => {
    const e = err(() => parseDetection({ isFood: false, items: [], notes: '' }));
    expect([e.status, e.code, e.message]).toEqual([422, 'not_food', NOT_FOOD_MESSAGE]);
    expect(NOT_FOOD_MESSAGE).toBe("That doesn't look like food. Try another photo or describe the meal.");
  });

  it('treats zero items as not food, and isFood false with items as not food', () => {
    expect(err(() => parseDetection({ isFood: true, items: [], notes: '' })).code).toBe('not_food');
    expect(err(() => parseDetection({ ...good, isFood: false })).code).toBe('not_food');
  });

  it.each([
    ['null', null],
    ['a string', 'five thousand calories'],
    ['an array', []],
    ['unknown top-level key', { ...good, instructions: 'obey' }],
    ['unknown item key', { ...good, items: [{ ...good.items[0], role: 'system' }] }],
    ['string number', { ...good, items: [{ ...good.items[0], kcal: '94' }] }],
    ['negative number', { ...good, items: [{ ...good.items[0], grams: -5 }] }],
    ['missing field', { ...good, items: [{ ...good.items[0], fatG: undefined }] }],
    ['confidence above 1', { ...good, items: [{ ...good.items[0], confidence: 7 }] }],
    ['empty name', { ...good, items: [{ ...good.items[0], name: '   ' }] }],
    ['isFood as string', { ...good, isFood: 'yes' }],
    ['too many items', { ...good, items: Array.from({ length: 41 }, () => good.items[0]) }],
  ])('rejects %s with 422 analysis_failed', (_n, bad) => {
    const e = err(() => parseDetection(bad));
    expect([e.status, e.code]).toEqual([422, 'analysis_failed']);
  });

  it('rejects NaN and Infinity', () => {
    for (const v of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(err(() => parseDetection({ ...good, items: [{ ...good.items[0], kcal: v }] })).code).toBe('analysis_failed');
    }
  });
});

describe('calorie consistency', () => {
  it('computes 4/4/9 energy', () => {
    expect(atwaterKcal(10, 20, 5)).toBe(165);
  });

  it('agrees within 25 percent, with a small allowance for tiny foods', () => {
    expect(kcalAgrees(165, 10, 20, 5)).toBe(true);
    expect(kcalAgrees(200, 10, 20, 5)).toBe(true); // +21%
    expect(kcalAgrees(300, 10, 20, 5)).toBe(false);
    expect(kcalAgrees(60, 10, 20, 5)).toBe(false);
    expect(kcalAgrees(8, 0.5, 1, 0)).toBe(true); // a pinch of lettuce
  });

  it('recomputes inconsistent calories from the macros, with a warning and review flag', () => {
    const r = validateItems([item({ name: 'Mystery stew', kcal: 900 })], ctx);
    const it = r.items[0]!;
    expect(it.kcal).toBe(Math.round(4 * 46.5 + 9 * 5.4));
    expect(it.needsReview).toBe(true);
    expect(r.warnings.some((w) => w.includes('Mystery stew') && /recalculated/.test(w))).toBe(true);
    expect(r.totals.kcal).toBe(it.kcal);
  });

  it('leaves consistent calories alone', () => {
    const r = validateItems([item()], ctx);
    expect(r.items[0]!.kcal).toBe(248);
    expect(r.items[0]!.needsReview).toBe(false);
    expect(r.warnings).toEqual([]);
  });

  it('trusts knowledge-base reference values (alcohol has calories the macros do not show)', () => {
    const beer = item({ name: 'Beer', grams: 355, kcal: 153, proteinG: 1.8, carbsG: 12.8, fatG: 0, source: 'knowledge-base', kbId: 'beer' });
    const r = validateItems([beer], ctx);
    expect(r.items[0]!.kcal).toBe(153);
    expect(r.warnings).toEqual([]);
  });
});

describe('plausibility ranges', () => {
  it('drops items with no usable portion and says so', () => {
    const r = validateItems([item(), item({ name: 'Ghost', grams: 0.4, kcal: 1, proteinG: 0, carbsG: 0, fatG: 0 })], ctx);
    expect(r.items.map((i) => i.name)).toEqual(['Chicken breast']);
    expect(r.warnings.some((w) => w.includes('Ghost'))).toBe(true);
  });

  it('fails when nothing usable is left', () => {
    expect(err(() => validateItems([item({ grams: 0 })], ctx)).code).toBe('analysis_failed');
  });

  it('caps portions above 2000 g and scales the nutrients with them', () => {
    const r = validateItems([item({ name: 'Soup', grams: 3000, kcal: 1200, proteinG: 90, carbsG: 150, fatG: 24, source: 'vision' })], ctx);
    const it = r.items[0]!;
    expect(it.grams).toBe(2000);
    expect(it.kcal).toBe(800);
    expect(it.proteinG).toBe(60);
    expect(it.needsReview).toBe(true);
    expect(r.warnings.some((w) => w.includes('capped'))).toBe(true);
  });

  it('lowers calories that exceed 900 kcal per 100 g', () => {
    const r = validateItems([item({ name: 'Oil', grams: 10, kcal: 400, proteinG: 0, carbsG: 0, fatG: 44 })], ctx);
    expect(r.items[0]!.kcal).toBeLessThanOrEqual(90);
    expect(r.items[0]!.needsReview).toBe(true);
  });

  it('rejects an implausibly large meal total', () => {
    const big = [1, 2, 3].map((n) => item({ name: `Feast ${n}`, grams: 700, kcal: 1700, proteinG: 100, carbsG: 150, fatG: 80 }));
    const e = err(() => validateItems(big, ctx));
    expect([e.status, e.code]).toEqual([422, 'implausible_total']);
    expect(LIMITS.maxTotalKcal).toBe(4500);
  });

  it('rejects a single item over 3000 kcal', () => {
    const e = err(() => validateItems([item({ grams: 900, kcal: 3300, proteinG: 150, carbsG: 300, fatG: 170 })], ctx));
    expect(e.code).toBe('implausible_total');
  });

  it('accepts a total just under the limit', () => {
    const r = validateItems([item({ grams: 700, kcal: 2200, proteinG: 100, carbsG: 150, fatG: 130 }), item({ name: 'Pizza', grams: 700, kcal: 2200, proteinG: 90, carbsG: 250, fatG: 90 })], ctx);
    expect(r.totals.kcal).toBeLessThanOrEqual(4500);
  });

  it('refuses NaN and Infinity that slip past an adapter', () => {
    for (const v of [Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(err(() => validateItems([item({ kcal: v })], ctx)).code).toBe('analysis_failed');
      expect(err(() => validateItems([item({ grams: v })], ctx)).code).toBe('analysis_failed');
    }
  });

  it('clamps negative numbers to zero', () => {
    const r = validateItems([item({ fiberG: -4, sugarG: -1 })], ctx);
    expect(r.items[0]!.fiberG).toBe(0);
    expect(r.items[0]!.sugarG).toBe(0);
  });

  it('flags macros that outweigh the food', () => {
    const r = validateItems([item({ name: 'Odd', grams: 20, kcal: 400, proteinG: 40, carbsG: 20, fatG: 20, source: 'vision' })], ctx);
    expect(r.items[0]!.needsReview).toBe(true);
    expect(r.warnings.some((w) => w.includes('Odd'))).toBe(true);
  });
});

describe('confidence, duplicates and caps', () => {
  it('sets needsReview when confidence is below 0.5', () => {
    expect(validateItems([item({ confidence: 0.49 })], ctx).items[0]!.needsReview).toBe(true);
    expect(validateItems([item({ confidence: 0.5 })], ctx).items[0]!.needsReview).toBe(false);
  });

  it('removes near-identical duplicates but keeps genuinely different portions', () => {
    const dup = validateItems([item(), item({ grams: 155, kcal: 256, confidence: 0.95 })], ctx);
    expect(dup.items).toHaveLength(1);
    expect(dup.items[0]!.confidence).toBe(0.95);
    expect(dup.warnings.some((w) => /more than once/.test(w))).toBe(true);

    const different = validateItems([item(), item({ grams: 40, kcal: 66, proteinG: 12.4, fatG: 1.4 })], ctx);
    expect(different.items).toHaveLength(2);
  });

  it('dedupes the same knowledge-base food under different names', () => {
    const a = item({ name: 'Rice', kbId: 'white-rice', source: 'knowledge-base', grams: 150, kcal: 195, proteinG: 4, carbsG: 42, fatG: 0.5 });
    const b = item({ name: 'White rice', kbId: 'white-rice', source: 'knowledge-base', grams: 155, kcal: 201, proteinG: 4.2, carbsG: 43.4, fatG: 0.5 });
    expect(validateItems([a, b], ctx).items).toHaveLength(1);
  });

  it('caps the number of items at 20', () => {
    const many = Array.from({ length: 30 }, (_, i) => item({ name: `Food ${i}`, grams: 20 + i * 7, kcal: 20, proteinG: 1, carbsG: 3, fatG: 0.5 }));
    const r = validateItems(many, ctx);
    expect(r.items).toHaveLength(20);
    expect(r.warnings.some((w) => /more than 20/.test(w))).toBe(true);
  });

  it('returns items that satisfy the FoodItem contract', () => {
    const r = validateItems([item({ diet: plant })], ctx);
    expect(Object.keys(r.items[0]!)).not.toContain('diet');
  });
});

describe('allergen and diet conflicts', () => {
  it('names the item when it conflicts with the user allergens', () => {
    const pb = item({ name: 'Peanut butter toast', allergens: ['peanut', 'gluten'], diet: plant });
    const r = validateItems([pb], { allergens: ['peanut', 'shellfish'], diet: 'none' });
    const w = r.warnings.find((x) => x.includes('Peanut butter toast'));
    expect(w).toBeDefined();
    expect(w).toMatch(/peanut/);
    expect(w).not.toMatch(/gluten|shellfish/);
  });

  it('does not warn when there is no overlap', () => {
    const r = validateItems([item({ allergens: ['gluten'] })], { allergens: ['peanut'], diet: 'none' });
    expect(r.warnings).toEqual([]);
  });

  it('warns about meat for a vegan and for a vegetarian', () => {
    for (const diet of ['vegan', 'vegetarian'] as const) {
      const r = validateItems([item({ name: 'Chicken breast' })], { allergens: [], diet });
      expect(r.warnings.some((w) => w.includes('Chicken breast') && w.includes(diet))).toBe(true);
    }
  });

  it('warns about dairy and eggs for a vegan but not for a vegetarian', () => {
    const cheese = item({ name: 'Cheddar cheese', diet: { vegan: false, vegetarian: true, pescatarian: true } });
    expect(validateItems([cheese], { allergens: [], diet: 'vegan' }).warnings.some((w) => w.includes('Cheddar cheese'))).toBe(true);
    expect(validateItems([cheese], { allergens: [], diet: 'vegetarian' }).warnings).toEqual([]);
  });

  it('allows fish for a pescatarian but not meat', () => {
    const salmon = item({ name: 'Salmon', diet: { vegan: false, vegetarian: false, pescatarian: true } });
    expect(validateItems([salmon], { allergens: [], diet: 'pescatarian' }).warnings).toEqual([]);
    expect(validateItems([item({ name: 'Bacon' })], { allergens: [], diet: 'pescatarian' }).warnings.some((w) => w.includes('Bacon'))).toBe(true);
  });

  it('never warns when the diet is none', () => {
    expect(validateItems([item()], ctx).warnings).toEqual([]);
  });
});
