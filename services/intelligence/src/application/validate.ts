import { FoodItem, round1, sumTotals, type Allergen, type AnalyzeRequest, type Totals } from '@leanplate/contracts';
import { AppError } from '@leanplate/security';
import { RawDetectionSchema, type RawDetection, type WorkingItem } from '../domain/detection';
import { dietConflict } from '../domain/diet';
import { words } from './retrieval';

export const LIMITS = {
  maxItems: 20,
  minGrams: 1,
  maxGrams: 2000,
  /** Pure fat is about 900 kcal per 100 g, so nothing real can exceed it. */
  maxKcalPer100g: 900,
  maxItemKcal: 3000,
  maxTotalKcal: 4500,
  /** Allowed gap between stated calories and 4*protein + 4*carbs + 9*fat. */
  kcalTolerance: 0.25,
  /** Small foods are allowed this many kcal of slack before the percentage rule applies. */
  kcalSlack: 10,
  lowConfidence: 0.5,
  duplicateGramTolerance: 0.15,
} as const;

export const NOT_FOOD_MESSAGE = "That doesn't look like food. Try another photo or describe the meal.";
const ANALYSIS_FAILED = 'We could not read that analysis. Please try again, or describe the meal in words.';

/**
 * Strict check of whatever an analyzer produced. Anything with the wrong shape,
 * extra keys, non-finite numbers or out-of-range values is rejected, never repaired.
 */
export function parseDetection(raw: unknown): RawDetection {
  const parsed = RawDetectionSchema.safeParse(raw);
  if (!parsed.success) throw new AppError(422, 'analysis_failed', ANALYSIS_FAILED);
  if (!parsed.data.isFood || parsed.data.items.length === 0) throw new AppError(422, 'not_food', NOT_FOOD_MESSAGE);
  return parsed.data;
}

export const atwaterKcal = (proteinG: number, carbsG: number, fatG: number): number => 4 * proteinG + 4 * carbsG + 9 * fatG;

export function kcalAgrees(kcal: number, proteinG: number, carbsG: number, fatG: number): boolean {
  const expected = atwaterKcal(proteinG, carbsG, fatG);
  return Math.abs(kcal - expected) <= Math.max(LIMITS.kcalSlack, LIMITS.kcalTolerance * expected);
}

function scale(item: WorkingItem, factor: number): WorkingItem {
  return {
    ...item,
    kcal: Math.round(item.kcal * factor),
    proteinG: round1(item.proteinG * factor),
    carbsG: round1(item.carbsG * factor),
    fatG: round1(item.fatG * factor),
    fiberG: round1(item.fiberG * factor),
    sugarG: round1(item.sugarG * factor),
  };
}

const NUMERIC = ['grams', 'kcal', 'proteinG', 'carbsG', 'fatG', 'fiberG', 'sugarG', 'confidence'] as const;

/** Fixes what can safely be fixed, flags what is doubtful, and drops what is unusable. */
function checkItem(input: WorkingItem, warnings: string[]): WorkingItem | null {
  let item = { ...input };
  for (const k of NUMERIC) {
    if (!Number.isFinite(item[k])) throw new AppError(422, 'analysis_failed', ANALYSIS_FAILED);
    if (item[k] < 0) item[k] = 0;
  }
  item.confidence = Math.min(1, item.confidence);

  if (item.grams < LIMITS.minGrams) {
    warnings.push(`We could not work out a portion for "${item.name}", so it was left out.`);
    return null;
  }
  if (item.grams > LIMITS.maxGrams) {
    item = { ...scale(item, LIMITS.maxGrams / item.grams), grams: LIMITS.maxGrams, needsReview: true };
    warnings.push(`The portion for "${item.name}" looked too large, so it was capped at ${LIMITS.maxGrams} g. Please check it.`);
  }

  // Protein, carbs and fat cannot weigh more than the food itself.
  if (item.proteinG + item.carbsG + item.fatG > item.grams * 1.05) {
    item.needsReview = true;
    warnings.push(`The nutrients listed for "${item.name}" add up to more than its weight. Please check it.`);
  }

  // Reference values from the knowledge base are trusted. Estimates must be internally consistent.
  if (item.source !== 'knowledge-base' && !kcalAgrees(item.kcal, item.proteinG, item.carbsG, item.fatG)) {
    const recomputed = Math.round(atwaterKcal(item.proteinG, item.carbsG, item.fatG));
    warnings.push(`The calories for "${item.name}" did not match its protein, carbs and fat, so they were recalculated (${recomputed} kcal). Please check it.`);
    item.kcal = recomputed;
    item.needsReview = true;
  }

  const ceiling = Math.round((LIMITS.maxKcalPer100g * item.grams) / 100);
  if (item.kcal > ceiling) {
    warnings.push(`The calories for "${item.name}" were more than any food can hold for its weight, so they were lowered. Please check it.`);
    item.kcal = ceiling;
    item.needsReview = true;
  }

  if (item.confidence < LIMITS.lowConfidence) item.needsReview = true;
  item.grams = Math.round(item.grams * 10) / 10;
  return item;
}

const nameKey = (name: string): string => words(name).sort().join(' ');

function dedupe(items: WorkingItem[], warnings: string[]): WorkingItem[] {
  const kept: WorkingItem[] = [];
  for (const it of items) {
    const dup = kept.findIndex((k) => {
      const same = nameKey(k.name) === nameKey(it.name) || (k.kbId !== undefined && k.kbId === it.kbId);
      const close = Math.abs(k.grams - it.grams) <= LIMITS.duplicateGramTolerance * Math.max(k.grams, it.grams);
      return same && close;
    });
    if (dup === -1) {
      kept.push(it);
    } else {
      if (it.confidence > kept[dup]!.confidence) kept[dup] = it;
      warnings.push(`"${it.name}" appeared more than once, so one copy was removed.`);
    }
  }
  return kept;
}

export interface ValidationContext {
  allergens: Allergen[];
  diet: AnalyzeRequest['diet'];
}

export interface Validated {
  items: FoodItem[];
  totals: Totals;
  warnings: string[];
}

export function validateItems(input: WorkingItem[], ctx: ValidationContext): Validated {
  const warnings: string[] = [];

  let items = input.map((i) => checkItem(i, warnings)).filter((i): i is WorkingItem => i !== null);
  if (items.length === 0) throw new AppError(422, 'analysis_failed', 'We could not work out the portions in that meal. Try another photo or describe it in words.');

  items = dedupe(items, warnings);
  if (items.length > LIMITS.maxItems) {
    warnings.push(`That meal has more than ${LIMITS.maxItems} items, so only the first ${LIMITS.maxItems} are shown.`);
    items = items.slice(0, LIMITS.maxItems);
  }

  for (const it of items) {
    if (it.kcal > LIMITS.maxItemKcal) {
      throw new AppError(422, 'implausible_total', `The calories for "${it.name}" are not believable for one meal. Check the portion or try another photo.`);
    }
    const hit = it.allergens.filter((a) => ctx.allergens.includes(a));
    if (hit.length > 0) {
      warnings.push(`"${it.name}" may contain ${hit.join(', ')}, which you listed as an allergen. Please check before eating.`);
    }
    const conflict = dietConflict(ctx.diet, it.diet);
    if (conflict) warnings.push(`"${it.name}" does not fit a ${conflict} diet, which is your food preference.`);
  }

  const totals = sumTotals(items);
  if (totals.kcal > LIMITS.maxTotalKcal) {
    throw new AppError(422, 'implausible_total', 'That adds up to more calories than a single meal usually holds. Check the portions or try another photo.');
  }

  const clean: FoodItem[] = items.map(({ diet: _diet, ...rest }) => {
    const r = FoodItem.safeParse(rest);
    if (!r.success) throw new AppError(422, 'analysis_failed', ANALYSIS_FAILED);
    return r.data;
  });
  return { items: clean, totals, warnings };
}
