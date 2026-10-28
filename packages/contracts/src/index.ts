import { z } from 'zod';

/* ------------------------------------------------------------------ *
 * Shared API contracts. Every service validates its inputs and outputs
 * against these schemas, so a malformed or hostile payload is rejected
 * at the edge of each service instead of deep inside business logic.
 * ------------------------------------------------------------------ */

/* ---------- identity ---------- */
export const Email = z.string().trim().toLowerCase().email().max(254);
export const Password = z.string().min(12, 'Use at least 12 characters').max(128);

export const RegisterBody = z.object({ email: Email, password: Password }).strict();
export const LoginBody = z.object({ email: Email, password: z.string().min(1).max(128) }).strict();
export const RefreshBody = z.object({ refreshToken: z.string().min(40).max(200) }).strict();
export const LogoutBody = RefreshBody;

export const TokenPair = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().int().positive(),
});
export type TokenPair = z.infer<typeof TokenPair>;

export const UserDto = z.object({ id: z.string().uuid(), email: Email });
export type UserDto = z.infer<typeof UserDto>;

/* ---------- profile and onboarding ---------- */
export const Sex = z.enum(['female', 'male']);
export const Activity = z.enum(['sedentary', 'light', 'moderate', 'active']);
export const Pace = z.enum(['gentle', 'steady', 'faster']);
export const Diet = z.enum(['none', 'vegetarian', 'vegan', 'pescatarian']);
export const Allergen = z.enum(['peanut', 'tree-nut', 'dairy', 'egg', 'gluten', 'soy', 'shellfish', 'fish', 'sesame']);
export type Allergen = z.infer<typeof Allergen>;

export const ProfileInput = z
  .object({
    sex: Sex,
    age: z.number().int().min(18).max(90),
    heightCm: z.number().min(120).max(230),
    weightKg: z.number().min(35).max(250),
    targetWeightKg: z.number().min(35).max(250),
    activity: Activity,
    pace: Pace,
    diet: Diet.default('none'),
    allergens: z.array(Allergen).max(9).default([]),
    acceptedDisclaimer: z.literal(true, { error: 'Please accept the note to continue' }),
  })
  .strict();
export type ProfileInput = z.infer<typeof ProfileInput>;

export const Profile = ProfileInput.omit({ acceptedDisclaimer: true }).extend({ updatedAt: z.string() });
export type Profile = z.infer<typeof Profile>;

export const Targets = z.object({
  mode: z.enum(['lose', 'maintain']),
  bmr: z.number(),
  tdee: z.number(),
  dailyKcal: z.number(),
  deficitKcal: z.number(),
  proteinG: z.number(),
  fiberG: z.number(),
  sugarCapG: z.number(),
  weeksToGoal: z.number().nullable(),
  notes: z.array(z.string()),
});
export type Targets = z.infer<typeof Targets>;

/* ---------- food and analysis ---------- */
export const MealType = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);
export type MealType = z.infer<typeof MealType>;

export const FoodItem = z
  .object({
    name: z.string().trim().min(1).max(80),
    grams: z.number().min(1).max(2000),
    kcal: z.number().min(0).max(3000),
    proteinG: z.number().min(0).max(300),
    carbsG: z.number().min(0).max(500),
    fatG: z.number().min(0).max(300),
    fiberG: z.number().min(0).max(100),
    sugarG: z.number().min(0).max(300),
    confidence: z.number().min(0).max(1),
    source: z.enum(['vision', 'text', 'knowledge-base', 'user']),
    kbId: z.string().max(60).optional(),
    allergens: z.array(Allergen).max(9).default([]),
    needsReview: z.boolean().default(false),
  })
  .strict();
export type FoodItem = z.infer<typeof FoodItem>;

export const Totals = z.object({
  kcal: z.number(),
  proteinG: z.number(),
  carbsG: z.number(),
  fatG: z.number(),
  fiberG: z.number(),
  sugarG: z.number(),
});
export type Totals = z.infer<typeof Totals>;

export const Citation = z.object({ id: z.string(), title: z.string(), snippet: z.string() });
export type Citation = z.infer<typeof Citation>;

export const ImagePayload = z.object({
  mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  dataBase64: z.string().min(100).max(4_500_000),
}).strict();

export const AnalyzeRequest = z
  .object({
    image: ImagePayload.optional(),
    text: z.string().max(600).optional(),
    allergens: z.array(Allergen).max(9).default([]),
    diet: Diet.default('none'),
  })
  .strict()
  .refine((v) => v.image || (v.text && v.text.trim().length > 1), { message: 'Provide a photo or a description' });
export type AnalyzeRequest = z.infer<typeof AnalyzeRequest>;

export const Analysis = z.object({
  items: z.array(FoodItem).max(20),
  totals: Totals,
  warnings: z.array(z.string()),
  citations: z.array(Citation),
  provider: z.string(),
});
export type Analysis = z.infer<typeof Analysis>;

/* ---------- verdict and feedback ---------- */
export const Flag = z.enum(['low-protein', 'high-sugar', 'low-fiber', 'high-energy-density', 'over-budget', 'allergen', 'light-meal']);
export type Flag = z.infer<typeof Flag>;

export const Verdict = z.object({
  score: z.number().min(0).max(100),
  label: z.enum(['on-track', 'okay', 'off-track']),
  reasons: z.array(z.string()),
  flags: z.array(Flag),
  mealBudgetKcal: z.number(),
  projectedDayKcal: z.number(),
  remainingAfterKcal: z.number(),
});
export type Verdict = z.infer<typeof Verdict>;

export const FeedbackRequest = z
  .object({ totals: Totals, label: z.enum(['on-track', 'okay', 'off-track']), flags: z.array(Flag).max(10) })
  .strict();
export type FeedbackRequest = z.infer<typeof FeedbackRequest>;

export const Feedback = z.object({
  headline: z.string().max(140),
  tips: z.array(z.string().max(220)).max(4),
  citations: z.array(Citation),
});
export type Feedback = z.infer<typeof Feedback>;

/* ---------- meals ---------- */
export const AnalyzeMealBody = z
  .object({
    mealType: MealType,
    image: ImagePayload.optional(),
    text: z.string().max(600).optional(),
    tzOffsetMinutes: z.number().int().min(-840).max(840).default(0),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .strict()
  .refine((v) => v.image || (v.text && v.text.trim().length > 1), { message: 'Provide a photo or a description' });
export type AnalyzeMealBody = z.infer<typeof AnalyzeMealBody>;

export const AnalyzeMealResult = z.object({ analysis: Analysis, verdict: Verdict, feedback: Feedback });
export type AnalyzeMealResult = z.infer<typeof AnalyzeMealResult>;

export const SaveMealBody = z
  .object({
    mealType: MealType,
    eatenAt: z.string().datetime({ offset: true }),
    items: z.array(FoodItem).min(1).max(20),
    note: z.string().trim().max(200).optional(),
    idempotencyKey: z.string().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/),
    tzOffsetMinutes: z.number().int().min(-840).max(840).default(0),
  })
  .strict();
export type SaveMealBody = z.infer<typeof SaveMealBody>;

export const MealRecord = z.object({
  id: z.string().uuid(),
  eatenAt: z.string(),
  mealType: MealType,
  items: z.array(FoodItem),
  totals: Totals,
  verdict: Verdict,
  feedback: Feedback.nullable(),
  note: z.string().nullable(),
});
export type MealRecord = z.infer<typeof MealRecord>;

export const DaySummary = z.object({
  date: z.string(),
  targets: Targets,
  consumed: Totals,
  remainingKcal: z.number(),
  mealCount: z.number(),
  onTrackCount: z.number(),
  week: z.array(z.object({ date: z.string(), kcal: z.number() })),
});
export type DaySummary = z.infer<typeof DaySummary>;

export const ErrorBody = z.object({ error: z.object({ code: z.string(), message: z.string(), requestId: z.string().optional() }) });
export type ErrorBody = z.infer<typeof ErrorBody>;

/* ---------- pure helpers shared by services and the web app ---------- */
export const round1 = (n: number) => Math.round(n * 10) / 10;

export function sumTotals(items: Pick<FoodItem, 'kcal' | 'proteinG' | 'carbsG' | 'fatG' | 'fiberG' | 'sugarG'>[]): Totals {
  const t = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0, sugarG: 0 };
  for (const i of items) {
    t.kcal += i.kcal;
    t.proteinG += i.proteinG;
    t.carbsG += i.carbsG;
    t.fatG += i.fatG;
    t.fiberG += i.fiberG;
    t.sugarG += i.sugarG;
  }
  return { kcal: Math.round(t.kcal), proteinG: round1(t.proteinG), carbsG: round1(t.carbsG), fatG: round1(t.fatG), fiberG: round1(t.fiberG), sugarG: round1(t.sugarG) };
}

/** Rescales one food item to a new portion. Used by the editor in the browser and re-checked on the server. */
export function scaleItem(item: FoodItem, grams: number): FoodItem {
  const f = grams / item.grams;
  return {
    ...item,
    grams,
    kcal: Math.round(item.kcal * f),
    proteinG: round1(item.proteinG * f),
    carbsG: round1(item.carbsG * f),
    fatG: round1(item.fatG * f),
    fiberG: round1(item.fiberG * f),
    sugarG: round1(item.sugarG * f),
    source: item.source === 'knowledge-base' || item.source === 'vision' || item.source === 'text' ? item.source : 'user',
  };
}

export const SERVICES = { identity: 'identity', meals: 'meals', intelligence: 'intelligence', web: 'web' } as const;
export type ServiceName = keyof typeof SERVICES;
