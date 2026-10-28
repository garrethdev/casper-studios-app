import type { Allergen, Flag } from '@leanplate/contracts';

export type FoodCategory =
  | 'breakfast'
  | 'protein'
  | 'grain'
  | 'vegetable'
  | 'fruit'
  | 'dairy'
  | 'nuts'
  | 'legume'
  | 'fast-food'
  | 'prepared'
  | 'sweets'
  | 'snacks'
  | 'drinks'
  | 'fats';

export type PortionUnit = 'cup' | 'tbsp' | 'tsp' | 'slice' | 'piece' | 'bowl' | 'glass' | 'can' | 'handful' | 'scoop';

/** Which eating patterns a food fits. vegan implies vegetarian implies pescatarian. */
export interface DietFlags {
  vegan: boolean;
  vegetarian: boolean;
  pescatarian: boolean;
}

export interface Per100g {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  sugarG: number;
}

/** One reference food. All figures are approximate reference values, not lab measurements. */
export interface Food {
  id: string;
  name: string;
  aliases: string[];
  category: FoodCategory;
  per100g: Per100g;
  /** A typical single serving in grams, used when nobody says how much. */
  typicalPortionG: number;
  portionLabel: string;
  allergens: Allergen[];
  diet: DietFlags;
  /** Weight of "one" when counting (one egg, one pancake) if that differs from the typical serving. */
  unitG?: number;
  /** Grams for a named household unit, when it differs from the category default. */
  units?: Partial<Record<PortionUnit, number>>;
  /** Alcoholic drinks get calories from alcohol, which the 4/4/9 macro check cannot see. */
  alcohol?: boolean;
}

export interface Guidance {
  id: string;
  title: string;
  text: string;
  tags: Flag[];
}
