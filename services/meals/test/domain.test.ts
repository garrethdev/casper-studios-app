import { describe, expect, it } from 'vitest';
import { sumTotals, type FoodItem } from '@leanplate/contracts';
import { computeTargets } from '../src/domain/targets';
import { scoreMeal } from '../src/domain/verdict';
import { addDays, dayRange, localDate } from '../src/domain/days';
import { verifyItems } from '../src/domain/integrity';

const body = { sex: 'female', age: 34, heightCm: 165, weightKg: 82, targetWeightKg: 68, activity: 'light', pace: 'steady' } as const;

const food = (o: Partial<FoodItem> = {}): FoodItem => ({
  name: 'Grilled chicken salad', grams: 350, kcal: 420, proteinG: 38, carbsG: 22, fatG: 18, fiberG: 7, sugarG: 6,
  confidence: 0.9, source: 'text', allergens: [], needsReview: false, ...o,
});

describe('targets', () => {
  it('uses Mifflin-St Jeor and a pace-based deficit', () => {
    const big = { ...body, age: 30, heightCm: 175, weightKg: 95, targetWeightKg: 80 };
    const t = computeTargets(big);
    expect(t.bmr).toBe(Math.round(10 * 95 + 6.25 * 175 - 5 * 30 - 161));
    expect(t.mode).toBe('lose');
    expect(t.deficitKcal).toBe(550);
    expect(t.dailyKcal).toBe(t.tdee - 550);
    expect(t.weeksToGoal).toBe(Math.ceil(15 / ((550 * 7) / 7700)));
  });

  it('caps the deficit at 25% and never goes under the safety floor', () => {
    const small = computeTargets({ ...body, sex: 'female', heightCm: 150, weightKg: 52, targetWeightKg: 45, activity: 'sedentary', pace: 'faster' });
    expect(small.dailyKcal).toBeGreaterThanOrEqual(1200);
    expect(small.deficitKcal).toBeLessThanOrEqual(Math.round(small.tdee * 0.25));
    expect(small.notes.length).toBeGreaterThan(0);
  });

  it('refuses to plan for a goal under BMI 18.5', () => {
    const t = computeTargets({ ...body, targetWeightKg: 40 });
    expect(t.notes.join(' ')).toMatch(/below a healthy range/);
    expect(t.weeksToGoal).toBe(Math.ceil((82 - Math.ceil(18.5 * 1.65 * 1.65)) / ((t.deficitKcal * 7) / 7700)));
  });

  it('maintains when already at goal', () => {
    const t = computeTargets({ ...body, targetWeightKg: 82 });
    expect(t.mode).toBe('maintain');
    expect(t.deficitKcal).toBe(0);
    expect(t.weeksToGoal).toBeNull();
  });
});

describe('verdict', () => {
  const targets = computeTargets(body);
  const input = (items: FoodItem[], o: Record<string, unknown> = {}) => ({
    mealType: 'lunch' as const, items, totals: sumTotals(items), targets, dayKcalBefore: 400, userAllergens: [] as any[], ...o,
  });

  it('rates a balanced, high-protein meal on track', () => {
    const v = scoreMeal(input([food()]));
    expect(v.label).toBe('on-track');
    expect(v.score).toBeGreaterThanOrEqual(72);
  });

  it('marks a large sugary meal off track and explains why', () => {
    const v = scoreMeal(input([food({ name: 'Milkshake and fries', grams: 600, kcal: 1500, proteinG: 18, carbsG: 190, fatG: 65, fiberG: 3, sugarG: 95 })]));
    expect(v.label).toBe('off-track');
    expect(v.flags).toEqual(expect.arrayContaining(['over-budget', 'high-sugar', 'low-protein']));
    expect(v.reasons.length).toBeGreaterThan(0);
  });

  it('penalises the same meal more when the day is already full', () => {
    const items = [food({ kcal: 650, proteinG: 40, carbsG: 60, fatG: 24 })];
    const early = scoreMeal(input(items, { dayKcalBefore: 200 }));
    const late = scoreMeal(input(items, { dayKcalBefore: 1300 }));
    expect(late.score).toBeLessThan(early.score);
    expect(late.remainingAfterKcal).toBeLessThan(0);
  });

  it('forces off-track when a listed allergen is present', () => {
    const v = scoreMeal(input([food({ allergens: ['peanut'] })], { userAllergens: ['peanut'] }));
    expect(v.flags).toContain('allergen');
    expect(v.label).toBe('off-track');
    expect(v.reasons[0]).toMatch(/peanut/);
  });

  it('is monotonic: more calories over budget never scores higher', () => {
    let prev = 101;
    for (const kcal of [500, 700, 900, 1100, 1400]) {
      const v = scoreMeal(input([food({ kcal, proteinG: 38, carbsG: (kcal - 4 * 38 - 9 * 18) / 4, fatG: 18 })]));
      expect(v.score).toBeLessThanOrEqual(prev);
      prev = v.score;
    }
  });
});

describe('days', () => {
  it('maps local days to UTC ranges using the browser offset', () => {
    // New York in winter: getTimezoneOffset() = 300
    const { start, end } = dayRange('2026-12-01', 300);
    expect(start.toISOString()).toBe('2026-12-01T05:00:00.000Z');
    expect(end.toISOString()).toBe('2026-12-02T05:00:00.000Z');
    expect(localDate('2026-12-02T03:30:00Z', 300)).toBe('2026-12-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('integrity', () => {
  it('recomputes calories that disagree with macros', () => {
    const { items } = verifyItems([food({ kcal: 50 })]);
    expect(items[0]!.kcal).toBe(Math.round(4 * 38 + 4 * 22 + 9 * 18));
    expect(items[0]!.needsReview).toBe(true);
  });

  it('rejects impossible densities, weights and meals', () => {
    expect(() => verifyItems([food({ grams: 10, kcal: 400, proteinG: 1, carbsG: 1, fatG: 1 })])).toThrow(/more calories/);
    expect(() => verifyItems([food({ grams: 20, kcal: 100, proteinG: 30, carbsG: 30, fatG: 30 })])).toThrow(/nutrients/);
    expect(() => verifyItems([food({ grams: 1200, kcal: 2800, proteinG: 100, carbsG: 300, fatG: 130 }), food({ grams: 1200, kcal: 2800, proteinG: 100, carbsG: 300, fatG: 130 })])).toThrow(/looks wrong/);
  });

  it('strips control and zero-width characters from names', () => {
    const { items } = verifyItems([food({ name: 'Egg\u200b\u0000s' })]);
    expect(items[0]!.name).toBe('Eggs');
  });
});
