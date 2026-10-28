import { describe, expect, it } from 'vitest';
import { Allergen, Flag } from '@leanplate/contracts';
import { kcalAgrees } from '../src/application/validate';
import { bestFoodMatch, createFoodRetriever, tokenize } from '../src/application/retrieval';
import { FOODS } from '../src/domain/knowledge/foods';
import { GUIDANCE } from '../src/domain/knowledge/guidance';

describe('food knowledge base', () => {
  it('has at least 120 foods with unique ids', () => {
    expect(FOODS.length).toBeGreaterThanOrEqual(120);
    expect(new Set(FOODS.map((f) => f.id)).size).toBe(FOODS.length);
  });

  it('covers every required category', () => {
    const cats = new Set(FOODS.map((f) => f.category));
    for (const c of ['breakfast', 'protein', 'grain', 'vegetable', 'fruit', 'dairy', 'nuts', 'fast-food', 'sweets', 'drinks']) {
      expect(cats.has(c as never), c).toBe(true);
    }
  });

  it('has no alias that points at two different foods', () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const f of FOODS) {
      for (const p of [f.name, ...f.aliases]) {
        const key = tokenize(p).join(' ');
        const owner = seen.get(key);
        if (owner && owner !== f.id) clashes.push(`${key}: ${owner} vs ${f.id}`);
        seen.set(key, f.id);
      }
    }
    expect(clashes).toEqual([]);
  });

  it('has plausible numbers for every food', () => {
    for (const f of FOODS) {
      const p = f.per100g;
      expect(p.kcal, f.id).toBeGreaterThanOrEqual(0);
      expect(p.kcal, f.id).toBeLessThanOrEqual(900);
      for (const v of Object.values(p)) expect(Number.isFinite(v) && v >= 0, f.id).toBe(true);
      expect(p.proteinG + p.carbsG + p.fatG, f.id).toBeLessThanOrEqual(100.5);
      expect(p.sugarG, f.id).toBeLessThanOrEqual(p.carbsG + 0.5);
      expect(p.fiberG, f.id).toBeLessThanOrEqual(p.carbsG + 0.5);
      expect(f.typicalPortionG, f.id).toBeGreaterThan(0);
      expect(f.typicalPortionG, f.id).toBeLessThanOrEqual(1000);
      expect(f.portionLabel.length, f.id).toBeGreaterThan(0);
      expect(f.aliases.length, f.id).toBeGreaterThan(0);
      for (const a of f.allergens) expect(Allergen.safeParse(a).success, `${f.id} ${a}`).toBe(true);
    }
  });

  it('keeps calories in step with protein, carbs and fat (alcohol aside)', () => {
    const off = FOODS.filter((f) => !f.alcohol && !kcalAgrees(f.per100g.kcal, f.per100g.proteinG, f.per100g.carbsG, f.per100g.fatG)).map((f) => f.id);
    expect(off).toEqual([]);
  });

  it('has consistent diet flags', () => {
    for (const f of FOODS) {
      if (f.diet.vegan) expect(f.diet.vegetarian, f.id).toBe(true);
      if (f.diet.vegetarian) expect(f.diet.pescatarian, f.id).toBe(true);
      if (f.diet.vegan) expect(f.allergens.includes('dairy') || f.allergens.includes('egg') || f.allergens.includes('fish') || f.allergens.includes('shellfish'), f.id).toBe(false);
    }
  });

  it('finds every food by its own name and by each alias', () => {
    const r = createFoodRetriever();
    const wrong: string[] = [];
    for (const f of FOODS) {
      for (const phrase of [f.name, ...f.aliases]) {
        const m = bestFoodMatch(r, phrase);
        if (m?.food.id !== f.id) wrong.push(`"${phrase}" -> ${m?.food.id ?? 'none'} (expected ${f.id})`);
      }
    }
    expect(wrong).toEqual([]);
  });
});

describe('guidance corpus', () => {
  it('has at least 25 snippets with unique ids and valid tags', () => {
    expect(GUIDANCE.length).toBeGreaterThanOrEqual(25);
    expect(new Set(GUIDANCE.map((g) => g.id)).size).toBe(GUIDANCE.length);
    for (const g of GUIDANCE) for (const t of g.tags) expect(Flag.safeParse(t).success, `${g.id} ${t}`).toBe(true);
  });

  it('covers every flag with at least two snippets and has untagged general habits', () => {
    for (const flag of Flag.options) expect(GUIDANCE.filter((g) => g.tags.includes(flag)).length, flag).toBeGreaterThanOrEqual(2);
    expect(GUIDANCE.filter((g) => g.tags.length === 0).length).toBeGreaterThanOrEqual(2);
  });

  it('is short, plain and free of medical or shaming language', () => {
    for (const g of GUIDANCE) {
      expect(g.text.length, g.id).toBeLessThanOrEqual(300);
      const first = /^.*?[.!?](?=\s|$)/.exec(g.text)![0];
      expect(first.length, g.id).toBeLessThanOrEqual(150);
      expect(g.text, g.id).not.toMatch(/\b(cure|treat|disease|diagnos\w*|medicat\w*|prescri\w*|guarantee\w*|lazy|guilty|cheat\w*)\b/i);
    }
  });
});
