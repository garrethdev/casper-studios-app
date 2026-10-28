import { round1, type Allergen, type Citation } from '@leanplate/contracts';
import type { ItemSource, RawItem, WorkingItem } from '../domain/detection';
import { inferAllergens, inferDiet } from '../domain/diet';
import { KNOWLEDGE_BASE_LABEL } from '../domain/knowledge/foods';
import type { Food } from '../domain/knowledge/types';
import { looksLikeInjection } from './preprocess';
import { bestFoodMatch, type Retriever } from './retrieval';

/** A model-supplied name is shown to people, so control characters and instruction-like text never get through. */
export const cleanName = (name: string): string => {
  const cleaned = name
    .normalize('NFKC')
    .replace(/[\p{Cc}\p{Cf}\p{Co}\p{Cn}\p{Cs}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    .trim();
  return looksLikeInjection(cleaned) ? 'Unidentified item' : cleaned;
};

/** The knowledge-base values for `grams` of a food. */
export function scaleFood(food: Food, grams: number) {
  const f = grams / 100;
  const p = food.per100g;
  return {
    kcal: Math.round(p.kcal * f),
    proteinG: round1(p.proteinG * f),
    carbsG: round1(p.carbsG * f),
    fatG: round1(p.fatG * f),
    fiberG: round1(p.fiberG * f),
    sugarG: round1(p.sugarG * f),
  };
}

export function citationFor(food: Food): Citation {
  const p = food.per100g;
  return {
    id: food.id,
    title: food.name,
    snippet: `${KNOWLEDGE_BASE_LABEL}: ${p.kcal} kcal, ${p.proteinG} g protein, ${p.carbsG} g carbs, ${p.fatG} g fat, ${p.fiberG} g fiber, ${p.sugarG} g sugar. Typical serving: ${food.portionLabel} (about ${food.typicalPortionG} g).`,
  };
}

export interface Grounded {
  items: WorkingItem[];
  citations: Citation[];
}

/**
 * Replaces the analyzer's guessed per-gram values with reference values when the
 * knowledge base has a strong match for the food's name. The analyzer's portion
 * (grams) is kept: only what the food IS comes from the knowledge base, never
 * how much of it was eaten. Items without a strong match keep the estimate and
 * are flagged for the user to review.
 */
export function groundItems(items: RawItem[], source: ItemSource, foods: Retriever<Food>): Grounded {
  const citations = new Map<string, Citation>();
  const out: WorkingItem[] = items.map((raw) => {
    const name = cleanName(raw.name) || 'Food item';
    const match = bestFoodMatch(foods, name);
    if (match) {
      const { food } = match;
      citations.set(food.id, citationFor(food));
      return {
        name,
        grams: raw.grams,
        ...scaleFood(food, raw.grams),
        confidence: raw.confidence,
        source: 'knowledge-base' as const,
        kbId: food.id,
        allergens: [...food.allergens],
        needsReview: false,
        diet: food.diet,
      };
    }
    const allergens: Allergen[] = inferAllergens(name);
    return {
      name,
      grams: raw.grams,
      kcal: raw.kcal,
      proteinG: raw.proteinG,
      carbsG: raw.carbsG,
      fatG: raw.fatG,
      fiberG: raw.fiberG,
      sugarG: raw.sugarG,
      confidence: raw.confidence,
      source: source,
      allergens,
      needsReview: true,
      diet: inferDiet(name),
    };
  });
  return { items: out, citations: [...citations.values()] };
}
