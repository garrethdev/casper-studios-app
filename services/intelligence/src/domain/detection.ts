import { z } from 'zod';
import type { FoodItem } from '@leanplate/contracts';
import type { DietFlags } from './knowledge/types';

const num = (max: number) => z.number().finite().min(0).max(max);

/** One food as reported by an analyzer, before grounding and validation. */
export const RawItemSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    grams: num(100_000),
    kcal: num(100_000),
    proteinG: num(100_000),
    carbsG: num(100_000),
    fatG: num(100_000),
    fiberG: num(100_000),
    sugarG: num(100_000),
    confidence: z.number().finite().min(0).max(1),
  })
  .strict();
export type RawItem = z.infer<typeof RawItemSchema>;

/** What every MealAnalyzer returns. Strict: unknown keys or wrong types are a failure, never passed through. */
export const RawDetectionSchema = z
  .object({
    isFood: z.boolean(),
    items: z.array(RawItemSchema).max(40),
    notes: z.string().max(400).default(''),
  })
  .strict();
export type RawDetection = z.infer<typeof RawDetectionSchema>;

/** A food item while it moves through grounding and validation. The diet flags never leave the service. */
export type WorkingItem = FoodItem & { diet: DietFlags };

export type ItemSource = 'vision' | 'text';
