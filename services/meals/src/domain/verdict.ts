import { round1, type Allergen, type Flag, type FoodItem, type MealType, type Targets, type Totals, type Verdict } from '@leanplate/contracts';

/** Share of the day's calories, protein and fiber each meal is expected to carry. */
export const MEAL_SHARE: Record<MealType, number> = { breakfast: 0.25, lunch: 0.3, dinner: 0.35, snack: 0.1 };

const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));

export interface VerdictInput {
  mealType: MealType;
  items: Pick<FoodItem, 'name' | 'grams' | 'allergens'>[];
  totals: Totals;
  targets: Targets;
  /** Calories already logged earlier in the same local day. */
  dayKcalBefore: number;
  userAllergens: Allergen[];
}

/**
 * Scores one meal from 0 to 100 against the user's plan. Calories (45) and
 * the effect on the rest of the day (15) matter most, then protein (20),
 * fiber (10) and sugar (10). An allergen the user listed overrides everything.
 */
export function scoreMeal(input: VerdictInput): Verdict {
  const { totals, targets, mealType } = input;
  const share = MEAL_SHARE[mealType];
  const budget = Math.round(targets.dailyKcal * share);
  const projected = input.dayKcalBefore + totals.kcal;
  const remainingAfter = targets.dailyKcal - projected;

  const flags: Flag[] = [];
  const reasons: string[] = [];

  // Calories: full marks up to the meal budget, nothing at 150% of it.
  const ratio = budget > 0 ? totals.kcal / budget : 1;
  let calorieScore: number;
  if (ratio <= 1) {
    calorieScore = 45;
    if (mealType !== 'snack' && ratio < 0.4) {
      calorieScore = 32;
      flags.push('light-meal');
      reasons.push(`This is a light ${mealType} at ${totals.kcal} kcal. That is fine if you plan to eat more later.`);
    } else {
      reasons.push(`${totals.kcal} kcal fits the ${budget} kcal planned for ${mealType}.`);
    }
  } else {
    calorieScore = 45 * clamp(1 - (ratio - 1) / 0.5);
    if (ratio > 1.15) flags.push('over-budget');
    reasons.push(`${totals.kcal} kcal is ${Math.round(totals.kcal - budget)} kcal over the ${budget} kcal planned for ${mealType}.`);
  }

  // Pressure on the rest of the day.
  let dayScore = 15;
  if (remainingAfter < 0) {
    dayScore = 15 * clamp(1 - -remainingAfter / (targets.dailyKcal * 0.2));
    if (!flags.includes('over-budget')) flags.push('over-budget');
    reasons.push(`Today would total ${Math.round(projected)} kcal, ${Math.round(-remainingAfter)} over your ${targets.dailyKcal} kcal target.`);
  } else if (remainingAfter < budget * 0.3 && mealType !== 'dinner') {
    dayScore = 9;
    reasons.push(`This leaves only ${Math.round(remainingAfter)} kcal for the rest of the day.`);
  }

  // Protein keeps you full, which is what makes a deficit bearable.
  const proteinTarget = targets.proteinG * share;
  const proteinRatio = proteinTarget > 0 ? totals.proteinG / proteinTarget : 1;
  const proteinScore = 20 * clamp(proteinRatio);
  if (proteinRatio < 0.6 && (mealType !== 'snack' || totals.kcal > 200)) {
    flags.push('low-protein');
    reasons.push(`Protein is ${round1(totals.proteinG)} g against about ${Math.round(proteinTarget)} g aimed for ${mealType}.`);
  } else if (proteinRatio >= 1) {
    reasons.push(`Good protein at ${round1(totals.proteinG)} g.`);
  }

  const fiberTarget = targets.fiberG * share;
  const fiberRatio = fiberTarget > 0 ? totals.fiberG / fiberTarget : 1;
  const fiberScore = 10 * clamp(fiberRatio);
  if (fiberRatio < 0.4 && totals.kcal > 250) {
    flags.push('low-fiber');
    reasons.push(`Only ${round1(totals.fiberG)} g of fiber, which makes a meal less filling.`);
  }

  const sugarCap = targets.sugarCapG * share;
  const sugarRatio = sugarCap > 0 ? totals.sugarG / sugarCap : 0;
  const sugarScore = sugarRatio <= 1 ? 10 : 10 * clamp(1 - (sugarRatio - 1));
  if (sugarRatio > 1.3 && totals.sugarG > 12) {
    flags.push('high-sugar');
    reasons.push(`${round1(totals.sugarG)} g of sugar is high for one ${mealType}.`);
  }

  const grams = input.items.reduce((s, i) => s + i.grams, 0);
  if (grams > 0 && totals.kcal > 300 && totals.kcal / grams > 2.5) {
    flags.push('high-energy-density');
    reasons.push('This meal packs a lot of calories into a small portion, so it may not keep you full.');
  }

  let score = calorieScore + dayScore + proteinScore + fiberScore + sugarScore;

  const hit = [...new Set(input.items.flatMap((i) => i.allergens))].filter((a) => input.userAllergens.includes(a));
  if (hit.length) {
    flags.push('allergen');
    reasons.unshift(`Contains ${hit.join(', ')}, which you said to avoid.`);
    score = Math.min(score, 20);
  }

  score = Math.round(clamp(score, 0, 100));
  const label: Verdict['label'] = score >= 72 ? 'on-track' : score >= 45 ? 'okay' : 'off-track';
  return {
    score,
    label,
    reasons: reasons.slice(0, 5),
    flags: [...new Set(flags)],
    mealBudgetKcal: budget,
    projectedDayKcal: Math.round(projected),
    remainingAfterKcal: Math.round(remainingAfter),
  };
}
