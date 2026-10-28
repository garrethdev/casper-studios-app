export type MealTypeName = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export const MEAL_TYPES: { v: MealTypeName; t: string }[] = [
  { v: 'breakfast', t: 'Breakfast' },
  { v: 'lunch', t: 'Lunch' },
  { v: 'dinner', t: 'Dinner' },
  { v: 'snack', t: 'Snack' },
];

/** A sensible default for the time of day; people can always change it. */
export function defaultMealType(d: Date = new Date()): MealTypeName {
  const h = d.getHours();
  if (h >= 4 && h < 10) return 'breakfast';
  if (h >= 10 && h < 15) return 'lunch';
  if (h >= 17 && h < 22) return 'dinner';
  return 'snack';
}
