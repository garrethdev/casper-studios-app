import type { Food, FoodCategory, PortionUnit } from './knowledge/types';

export type Unit = PortionUnit | 'g' | 'kg' | 'oz' | 'lb' | 'ml' | 'l' | 'serving';

/** Units that name an exact weight or volume (1 ml is treated as 1 g). */
const EXACT: Partial<Record<Unit, number>> = { g: 1, kg: 1000, oz: 28.35, lb: 453.6, ml: 1, l: 1000 };

export const isExactUnit = (u: Unit): boolean => u in EXACT;

const CUP: Record<FoodCategory, number> = {
  drinks: 240,
  dairy: 245,
  grain: 160,
  legume: 170,
  vegetable: 100,
  fruit: 150,
  nuts: 140,
  protein: 140,
  prepared: 240,
  'fast-food': 150,
  sweets: 100,
  snacks: 30,
  fats: 220,
  breakfast: 200,
};

const BOWL: Partial<Record<FoodCategory, number>> = { grain: 250, legume: 200, vegetable: 150, fruit: 150, prepared: 300, breakfast: 240, drinks: 350, dairy: 245 };
const TBSP: Partial<Record<FoodCategory, number>> = { fats: 14, nuts: 16, sweets: 20, dairy: 15 };
const HANDFUL: Partial<Record<FoodCategory, number>> = { nuts: 28, fruit: 75, snacks: 28 };

function labelMentions(food: Food, word: string): boolean {
  return food.portionLabel.toLowerCase().includes(word);
}

/** Grams in ONE of the given non-exact unit, for this food. */
function gramsPerUnit(food: Food, unit: PortionUnit): number {
  const own = food.units?.[unit];
  if (own !== undefined) return own;
  switch (unit) {
    case 'cup':
      return CUP[food.category];
    case 'tbsp':
      return TBSP[food.category] ?? 15;
    case 'tsp':
      return (food.units?.tbsp ?? TBSP[food.category] ?? 15) / 3;
    case 'slice':
      return labelMentions(food, 'slice') ? food.typicalPortionG : (food.unitG ?? food.typicalPortionG);
    case 'piece':
      return food.unitG ?? food.typicalPortionG;
    case 'bowl':
      return BOWL[food.category] ?? 250;
    case 'glass':
      return food.category === 'dairy' ? 245 : 240;
    case 'can':
      return food.category === 'drinks' ? 355 : food.typicalPortionG;
    case 'handful':
      return HANDFUL[food.category] ?? 30;
    case 'scoop':
      return 60;
  }
}

export interface PortionRequest {
  qty?: number;
  unit?: Unit;
  /** small = 0.75, medium = 1, large = 1.25 */
  size?: number;
}

export interface ResolvedPortion {
  grams: number;
  /** True when nobody said how much and the typical serving was used. */
  defaulted: boolean;
}

/** Turns "2 slices", "150 g", "half" or nothing at all into grams for a given food. */
export function resolveGrams(food: Food, req: PortionRequest = {}): ResolvedPortion {
  const size = req.size ?? 1;
  let grams: number;
  let defaulted = false;
  const { qty, unit } = req;

  if (unit && unit in EXACT) {
    grams = (qty ?? 1) * EXACT[unit]!;
  } else if (unit === 'serving') {
    grams = (qty ?? 1) * food.typicalPortionG * size;
  } else if (unit) {
    grams = (qty ?? 1) * gramsPerUnit(food, unit as PortionUnit) * size;
  } else if (qty !== undefined) {
    grams = qty * (food.unitG ?? food.typicalPortionG) * size;
  } else {
    grams = food.typicalPortionG * size;
    defaulted = true;
  }
  return { grams: Math.min(2000, Math.max(1, Math.round(grams))), defaulted };
}
