import { describe, expect, it } from 'vitest';
import { AnalyzeMealBody, LoginBody, ProfileInput, RegisterBody, SaveMealBody } from '@leanplate/contracts';

const profile = {
  sex: 'female', age: 34, heightCm: 165, weightKg: 82, targetWeightKg: 68, activity: 'light', pace: 'steady',
  diet: 'none', allergens: ['peanut'], acceptedDisclaimer: true,
};
const item = {
  name: 'Oats', grams: 60, kcal: 230, proteinG: 8, carbsG: 40, fatG: 4, fiberG: 6, sugarG: 1, confidence: 0.9, source: 'text', allergens: [], needsReview: false,
};
const meal = { mealType: 'lunch', eatenAt: '2026-10-26T16:00:00Z', items: [item], idempotencyKey: 'abcdefgh-1234', tzOffsetMinutes: 240 };

describe('request bodies are validated with the shared contracts', () => {
  it('accepts valid bodies', () => {
    expect(ProfileInput.safeParse(profile).success).toBe(true);
    expect(SaveMealBody.safeParse(meal).success).toBe(true);
    expect(LoginBody.safeParse({ email: 'A@B.co', password: 'x' }).success).toBe(true);
    expect(AnalyzeMealBody.safeParse({ mealType: 'snack', text: 'an apple' }).success).toBe(true);
  });

  it('rejects unknown fields (strict) on every body', () => {
    expect(ProfileInput.safeParse({ ...profile, isAdmin: true }).success).toBe(false);
    expect(RegisterBody.safeParse({ email: 'a@b.co', password: 'x'.repeat(12), role: 'admin' }).success).toBe(false);
    expect(LoginBody.safeParse({ email: 'a@b.co', password: 'x', userId: 'someone-else' }).success).toBe(false);
    expect(AnalyzeMealBody.safeParse({ mealType: 'snack', text: 'an apple', userId: 'x' }).success).toBe(false);
    expect(SaveMealBody.safeParse({ ...meal, userId: 'x' }).success).toBe(false);
    expect(SaveMealBody.safeParse({ ...meal, items: [{ ...item, extra: 1 }] }).success).toBe(false);
  });

  it('rejects a profile without the accepted note, or with it set to anything but true', () => {
    const { acceptedDisclaimer: _omit, ...without } = profile;
    expect(ProfileInput.safeParse(without).success).toBe(false);
    expect(ProfileInput.safeParse({ ...profile, acceptedDisclaimer: false }).success).toBe(false);
    expect(ProfileInput.safeParse({ ...profile, acceptedDisclaimer: 'true' }).success).toBe(false);
  });

  it('rejects out-of-range numbers and short passwords', () => {
    expect(ProfileInput.safeParse({ ...profile, age: 17 }).success).toBe(false);
    expect(ProfileInput.safeParse({ ...profile, heightCm: 300 }).success).toBe(false);
    expect(ProfileInput.safeParse({ ...profile, weightKg: 20 }).success).toBe(false);
    expect(RegisterBody.safeParse({ email: 'a@b.co', password: 'short' }).success).toBe(false);
  });

  it('analyze needs a photo or a real description; save needs an idempotency key in a safe alphabet', () => {
    expect(AnalyzeMealBody.safeParse({ mealType: 'lunch' }).success).toBe(false);
    expect(AnalyzeMealBody.safeParse({ mealType: 'lunch', text: ' ' }).success).toBe(false);
    expect(AnalyzeMealBody.safeParse({ mealType: 'lunch', image: { mediaType: 'image/gif', dataBase64: 'x'.repeat(200) } }).success).toBe(false);
    expect(SaveMealBody.safeParse({ ...meal, idempotencyKey: 'bad key!!' }).success).toBe(false);
    expect(SaveMealBody.safeParse({ ...meal, items: [] }).success).toBe(false);
  });
});
