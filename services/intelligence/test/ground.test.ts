import { describe, expect, it } from 'vitest';
import { cleanName, groundItems } from '../src/application/ground';
import { createFoodRetriever } from '../src/application/retrieval';
import { getFood } from '../src/domain/knowledge/foods';
import type { RawItem } from '../src/domain/detection';

const foods = createFoodRetriever();

const raw = (over: Partial<RawItem> = {}): RawItem => ({
  name: 'Banana',
  grams: 118,
  kcal: 500,
  proteinG: 30,
  carbsG: 10,
  fatG: 20,
  fiberG: 0,
  sugarG: 0,
  confidence: 0.8,
  ...over,
});

describe('grounding', () => {
  it('replaces guessed macros with knowledge-base values scaled to the grams', () => {
    const { items, citations } = groundItems([raw()], 'vision', foods);
    const banana = getFood('banana')!;
    expect(items).toHaveLength(1);
    const it = items[0]!;
    expect(it.source).toBe('knowledge-base');
    expect(it.kbId).toBe('banana');
    expect(it.grams).toBe(118);
    expect(it.kcal).toBe(Math.round(banana.per100g.kcal * 1.18));
    expect(it.proteinG).toBe(Math.round(banana.per100g.proteinG * 11.8) / 10);
    expect(it.needsReview).toBe(false);
    expect(it.confidence).toBe(0.8);
    expect(citations).toHaveLength(1);
    expect(citations[0]!.id).toBe('banana');
    expect(citations[0]!.snippet).toMatch(/approximate/i);
  });

  it('keeps the model portion: only what the food is comes from the knowledge base', () => {
    const { items } = groundItems([raw({ name: 'Grilled chicken breast', grams: 250 })], 'vision', foods);
    expect(items[0]!.grams).toBe(250);
    expect(items[0]!.kcal).toBe(Math.round(165 * 2.5));
  });

  it('sets allergens from the knowledge base', () => {
    const { items } = groundItems([raw({ name: 'Peanut butter', grams: 32 })], 'vision', foods);
    expect(items[0]!.allergens).toEqual(['peanut']);
    expect(items[0]!.kbId).toBe('peanut-butter');
  });

  it('keeps the estimate and flags review when there is no strong match', () => {
    const dish = raw({ name: 'Bibimbap with kimchi', grams: 400, kcal: 620, proteinG: 25, carbsG: 85, fatG: 18 });
    const { items, citations } = groundItems([dish], 'vision', foods);
    const it = items[0]!;
    expect(it.source).toBe('vision');
    expect(it.kbId).toBeUndefined();
    expect(it.kcal).toBe(620);
    expect(it.proteinG).toBe(25);
    expect(it.needsReview).toBe(true);
    expect(citations).toEqual([]);
  });

  it('labels ungrounded items from the text parser as text', () => {
    const { items } = groundItems([raw({ name: 'Mystery casserole' })], 'text', foods);
    expect(items[0]!.source).toBe('text');
  });

  it('does not guess when a name only shares one generic word', () => {
    const { items } = groundItems([raw({ name: 'Chicken Alfredo bake' })], 'vision', foods);
    expect(items[0]!.kbId).toBeUndefined();
    expect(items[0]!.needsReview).toBe(true);
  });

  it('infers allergens and diet from the name for unknown dishes', () => {
    const { items } = groundItems([raw({ name: 'Peanut satay chicken skewers', grams: 150 })], 'vision', foods);
    const it = items[0]!;
    expect(it.kbId).toBeUndefined();
    expect(it.allergens).toContain('peanut');
    expect(it.diet.vegetarian).toBe(false);
  });

  it('lists each cited food once', () => {
    const { citations } = groundItems([raw(), raw({ name: 'bananas', grams: 60 }), raw({ name: 'Apple', grams: 180 })], 'vision', foods);
    expect(citations.map((c) => c.id).sort()).toEqual(['apple', 'banana']);
  });

  it('cleans names: control and invisible characters removed, length capped', () => {
    const dirty = `Ban${String.fromCodePoint(0)}ana${String.fromCodePoint(0x200b)}   \n smoothie ${'x'.repeat(200)}`;
    const name = cleanName(dirty);
    expect(name.length).toBeLessThanOrEqual(80);
    expect(name.startsWith('Banana smoothie')).toBe(true);
    expect(name).not.toMatch(/[\u0000​\n]/);
  });
});
