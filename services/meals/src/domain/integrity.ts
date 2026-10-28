import { round1, type FoodItem } from '@leanplate/contracts';
import { AppError } from '@leanplate/security';

export const MAX_MEAL_KCAL = 4500;

/**
 * The browser lets people edit a breakdown, and a request can be forged, so the
 * server never trusts the numbers it receives. Calories are re-derived from
 * macros when they disagree by more than 25%, impossible densities are
 * rejected, and the meal as a whole must be plausible.
 */
export function verifyItems(items: FoodItem[]): { items: FoodItem[]; adjusted: number } {
  let adjusted = 0;
  const out = items.map((raw): FoodItem => {
    const item = { ...raw, name: raw.name.replace(/[\p{Cc}\p{Cf}\u2028\u2029]/gu, '').trim() };
    if (!item.name) throw new AppError(422, 'invalid_item', 'Every food needs a name');
    const nums = [item.grams, item.kcal, item.proteinG, item.carbsG, item.fatG, item.fiberG, item.sugarG];
    if (nums.some((n) => !Number.isFinite(n))) throw new AppError(422, 'invalid_item', `Numbers for "${item.name}" are not valid`);
    if (item.kcal / item.grams > 9.5) throw new AppError(422, 'implausible_item', `"${item.name}" has more calories than any food can have for its weight`);
    if (item.proteinG + item.carbsG + item.fatG > item.grams * 1.02) throw new AppError(422, 'implausible_item', `"${item.name}" has more nutrients than its weight`);
    if (item.fiberG > item.carbsG + 0.5 || item.sugarG > item.carbsG + 0.5) {
      // Fiber and sugar are both carbohydrates; clamp rather than reject.
      item.fiberG = Math.min(item.fiberG, item.carbsG);
      item.sugarG = Math.min(item.sugarG, item.carbsG);
      adjusted++;
    }
    const fromMacros = 4 * item.proteinG + 4 * item.carbsG + 9 * item.fatG;
    if (fromMacros > 20 && Math.abs(item.kcal - fromMacros) / fromMacros > 0.25) {
      item.kcal = Math.round(fromMacros);
      item.needsReview = true;
      adjusted++;
    }
    // Round-trip through the helper's precision so stored totals are stable.
    item.proteinG = round1(item.proteinG);
    item.carbsG = round1(item.carbsG);
    item.fatG = round1(item.fatG);
    item.fiberG = round1(item.fiberG);
    item.sugarG = round1(item.sugarG);
    return item;
  });
  const kcal = out.reduce((s, i) => s + i.kcal, 0);
  if (kcal > MAX_MEAL_KCAL) throw new AppError(422, 'implausible_meal', `A single meal of ${Math.round(kcal)} kcal looks wrong. Check the portions.`);
  return { items: out, adjusted };
}
