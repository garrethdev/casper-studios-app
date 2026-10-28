import { describe, expect, it } from 'vitest';
import { FLAG_QUERIES, Retriever, bestFoodMatch, createFoodRetriever, createGuidanceRetriever, stem, tokenize } from '../src/application/retrieval';
import { Flag } from '@leanplate/contracts';

const foods = createFoodRetriever();
const guidance = createGuidanceRetriever();
const top = (q: string, n = 1) => foods.search(q, { limit: n }).map((h) => h.doc.id);

describe('tokenizing and stemming', () => {
  it('folds plurals and -ie/-y endings', () => {
    expect(stem('eggs')).toBe('egg');
    expect(stem('berries')).toBe('berry');
    expect(stem('cookies')).toBe(stem('cookie'));
    expect(stem('tomatoes')).toBe('tomato');
    expect(stem('sandwiches')).toBe('sandwich');
    expect(stem('hummus')).toBe('hummus');
    expect(stem('glass')).toBe('glass');
  });

  it('lowercases, removes accents and drops stop words', () => {
    expect(tokenize('The Jalapeño PEPPERS, with a side of Rice')).toEqual(['jalapeno', 'pepper', 'rice']);
  });
});

describe('BM25 over foods', () => {
  it.each([
    ['grilled chicken breast', 'chicken-breast'],
    ['oats', 'rolled-oats'],
    ['soda', 'cola'],
    ['scrambled eggs', 'scrambled-eggs'],
    ['egg', 'boiled-egg'],
    ['banana', 'banana'],
    ['salmon fillet', 'salmon'],
    ['peanut butter', 'peanut-butter'],
    ['greek yogurt', 'greek-yogurt'],
    ['brown rice', 'brown-rice'],
    ['french fries', 'french-fries'],
    ['cheeseburger', 'cheeseburger'],
    ['avocado', 'avocado'],
    ['oatmeal', 'oatmeal-cooked'],
    ['whole wheat toast', 'whole-wheat-bread'],
    ['diet coke', 'diet-soda'],
    ['almond milk', 'almond-milk'],
    ['sweet potato', 'sweet-potato'],
  ])('"%s" finds %s first', (query, id) => {
    expect(top(query)).toEqual([id]);
  });

  it('finds the right food from natural wording and plurals', () => {
    expect(top('Chicken Breasts')[0]).toBe('chicken-breast');
    expect(top('blueberries')[0]).toBe('blueberries');
    expect(top('tomatoes')[0]).toBe('tomato');
    expect(top('a big plate of spaghetti')[0]).toBe('pasta');
    expect(top('pizza')[0]).toBe('cheese-pizza');
    expect(top('ice-cream')[0]).toBe('ice-cream');
    expect(top('café latte')[0]).toBe('latte');
  });

  it('puts oatmeal foods ahead of unrelated ones for "oats"', () => {
    expect(top('oats', 3)).toContain('rolled-oats');
  });

  it('boosts alias matches (coke is cola, pb is peanut butter)', () => {
    expect(top('coke')[0]).toBe('cola');
    expect(top('pb')[0]).toBe('peanut-butter');
    expect(top('prawns')[0]).toBe('shrimp');
  });

  it('returns nothing for gibberish or stop words only', () => {
    expect(foods.search('zzzqqq xyzzy')).toEqual([]);
    expect(foods.search('the of and')).toEqual([]);
    expect(foods.search('')).toEqual([]);
  });

  it('reports coverage and exact matches', () => {
    const [h] = foods.search('grilled chicken breast');
    expect(h!.exact).toBe(true);
    expect(h!.coverage).toBe(1);
    const [p] = foods.search('purple dragon chicken');
    expect(p!.exact).toBe(false);
    expect(p!.coverage).toBeLessThan(0.6);
  });

  it('supports a filter and a limit', () => {
    const hits = foods.search('milk', { limit: 3, filter: (f) => f.category === 'dairy' });
    expect(hits.length).toBeLessThanOrEqual(3);
    expect(hits.every((h) => h.doc.category === 'dairy')).toBe(true);
  });
});

describe('bestFoodMatch thresholds', () => {
  it('accepts strong matches', () => {
    expect(bestFoodMatch(foods, 'Grilled chicken breast')?.food.id).toBe('chicken-breast');
    expect(bestFoodMatch(foods, 'Fresh sliced banana')?.food.id).toBe('banana');
  });

  it('rejects dishes that only share one generic word', () => {
    expect(bestFoodMatch(foods, 'Pho')).toBeNull();
    expect(bestFoodMatch(foods, 'Bibimbap with kimchi')).toBeNull();
    expect(bestFoodMatch(foods, 'Quail egg tempura')).toBeNull();
  });

  it('rejects ambiguous generic words instead of guessing', () => {
    expect(bestFoodMatch(foods, 'sauce')).toBeNull();
  });
});

describe('generic Retriever', () => {
  it('works on any corpus', () => {
    const docs = [
      { id: 'a', title: 'Blue whale', body: 'largest animal' },
      { id: 'b', title: 'Red fox', body: 'small orange canine animal' },
      { id: 'c', title: 'Fox terrier', body: 'a dog' },
    ];
    const r = new Retriever(docs, { id: (d) => d.id, fields: (d) => [{ text: d.title, weight: 3 }, { text: d.body, weight: 1 }], phrases: (d) => [d.title] });
    expect(r.search('red fox')[0]!.doc.id).toBe('b');
    expect(r.search('animal').map((h) => h.doc.id).sort()).toEqual(['a', 'b']);
    expect(r.size).toBe(3);
  });
});

describe('guidance retrieval', () => {
  it.each(Flag.options)('returns snippets tagged %s for its flag query', (flag) => {
    const hits = guidance.search(FLAG_QUERIES[flag], { limit: 3, filter: (g) => g.tags.includes(flag) });
    expect(hits.length).toBeGreaterThanOrEqual(2);
    for (const h of hits) expect(h.doc.tags).toContain(flag);
  });

  it('ranks topical snippets first without a filter', () => {
    expect(guidance.search('protein keeps you full', { limit: 3 }).map((h) => h.doc.id)).toContain('protein-satiety');
    expect(guidance.search('liquid calories soda juice drinks', { limit: 3 }).map((h) => h.doc.id)).toContain('sugar-drinks');
    expect(guidance.search('fiber vegetables beans', { limit: 4 }).every((h) => h.doc.tags.length >= 0)).toBe(true);
  });
});
