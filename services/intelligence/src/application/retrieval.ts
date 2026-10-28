import type { Flag } from '@leanplate/contracts';
import { FOODS } from '../domain/knowledge/foods';
import { GUIDANCE } from '../domain/knowledge/guidance';
import type { Food, Guidance } from '../domain/knowledge/types';

/* ------------------------------------------------------------------ *
 * Tokenizing
 * ------------------------------------------------------------------ */

/** Words that carry no meaning for matching a food. */
const STOP = new Set([
  'a', 'an', 'the', 'of', 'and', 'with', 'in', 'on', 'for', 'to', 'some', 'my', 'i', 'had', 'ate', 'have', 'has', 'is', 'it', 'or', 'at', 'from', 'as', 'by', 'few',
  // descriptors that do not change which food it is
  'fresh', 'sliced', 'large', 'small', 'medium', 'big', 'little', 'cooked', 'plain', 'homemade', 'serving', 'portion', 'piece', 'side', 'cup', 'plate', 'slice',
]);

/** Light stemming. Plurals fold to one form, and "-ie" and "-y" endings meet in the middle (cookie, cookies, berry, berries). */
export function stem(word: string): string {
  let w = word;
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 4 && w.endsWith('ie')) return w.slice(0, -2) + 'y';
  if (w.length > 4 && w.endsWith('oes')) return w.slice(0, -2);
  if (w.length > 4 && /(ch|sh|x|ss)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') && !w.endsWith('is')) w = w.slice(0, -1);
  return w;
}

/** Lowercases, removes accents, splits into words and folds plurals. Does not drop stop words. */
export function words(text: string): string[] {
  const plain = text
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/['’]/g, '');
  return (plain.match(/[a-z0-9]+/g) ?? []).map(stem);
}

/** Words used for ranking: stop words are removed. */
export function tokenize(text: string): string[] {
  return words(text).filter((w) => !STOP.has(w) && w.length > 0);
}

/* ------------------------------------------------------------------ *
 * BM25
 * ------------------------------------------------------------------ */

export interface RetrieverOptions<T> {
  id(doc: T): string;
  /** Searchable text, with a weight per field. A match in a heavier field counts for more. */
  fields(doc: T): Array<{ text: string; weight: number }>;
  /** Names or aliases that identify the document outright. An exact phrase match is boosted strongly. */
  phrases?(doc: T): string[];
  k1?: number;
  b?: number;
}

export interface Hit<T> {
  doc: T;
  score: number;
  /** How many of the query's distinct terms appear in the document. */
  matched: number;
  /** matched / distinct query terms, from 0 to 1. */
  coverage: number;
  /** The whole query equals one of the document's phrases. */
  exact: boolean;
}

interface Indexed<T> {
  doc: T;
  tf: Map<string, number>;
  len: number;
  phrases: string[][];
}

const EXACT_BOOST = 2.5;
const CONTAINS_BOOST = 1.4;

function containsRun(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let i = 0; i + needle.length <= haystack.length; i++) {
    if (needle.every((w, j) => haystack[i + j] === w)) return true;
  }
  return false;
}

/** A small BM25 index over any list of documents. Used for both the food and the guidance corpora. */
export class Retriever<T> {
  private readonly docs: Indexed<T>[];
  private readonly df = new Map<string, number>();
  private readonly avgLen: number;
  private readonly k1: number;
  private readonly b: number;

  constructor(items: readonly T[], private readonly opts: RetrieverOptions<T>) {
    this.k1 = opts.k1 ?? 1.4;
    this.b = opts.b ?? 0.45;
    this.docs = items.map((doc) => {
      const tf = new Map<string, number>();
      let len = 0;
      for (const f of opts.fields(doc)) {
        for (const t of tokenize(f.text)) {
          tf.set(t, (tf.get(t) ?? 0) + f.weight);
          len += 1;
        }
      }
      for (const t of tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
      const phrases = (opts.phrases?.(doc) ?? []).map(tokenize).filter((p) => p.length > 0);
      return { doc, tf, len, phrases };
    });
    this.avgLen = this.docs.reduce((n, d) => n + d.len, 0) / Math.max(1, this.docs.length);
  }

  get size(): number {
    return this.docs.length;
  }

  private idf(term: string): number {
    const n = this.df.get(term) ?? 0;
    return Math.log(1 + (this.docs.length - n + 0.5) / (n + 0.5));
  }

  search(query: string, options: { limit?: number; filter?: (doc: T) => boolean } = {}): Hit<T>[] {
    const q = tokenize(query);
    const terms = [...new Set(q)];
    if (terms.length === 0) return [];
    const hits: Hit<T>[] = [];

    for (const d of this.docs) {
      if (options.filter && !options.filter(d.doc)) continue;
      let score = 0;
      let matched = 0;
      for (const t of terms) {
        const f = d.tf.get(t);
        if (!f) continue;
        matched += 1;
        score += (this.idf(t) * f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + (this.b * d.len) / this.avgLen));
      }
      if (matched === 0) continue;

      const exact = d.phrases.some((p) => p.length === q.length && p.every((w, i) => w === q[i]));
      if (exact) score *= EXACT_BOOST;
      else if (d.phrases.some((p) => p.length >= 2 && containsRun(q, p))) score *= CONTAINS_BOOST;

      hits.push({ doc: d.doc, score, matched, coverage: matched / terms.length, exact });
    }

    hits.sort((a, b) => b.score - a.score || this.opts.id(a.doc).localeCompare(this.opts.id(b.doc)));
    return hits.slice(0, options.limit ?? 5);
  }
}

/* ------------------------------------------------------------------ *
 * The two corpora
 * ------------------------------------------------------------------ */

export function createFoodRetriever(foods: readonly Food[] = FOODS): Retriever<Food> {
  return new Retriever<Food>(foods, {
    id: (f) => f.id,
    fields: (f) => [
      { text: f.name, weight: 3 },
      { text: f.aliases.join(' '), weight: 2 },
    ],
    phrases: (f) => [f.name, ...f.aliases],
  });
}

export function createGuidanceRetriever(items: readonly Guidance[] = GUIDANCE): Retriever<Guidance> {
  return new Retriever<Guidance>(items, {
    id: (g) => g.id,
    fields: (g) => [
      { text: g.title, weight: 3 },
      { text: g.tags.join(' ').replace(/-/g, ' '), weight: 2 },
      { text: g.text, weight: 1 },
    ],
  });
}

/* ------------------------------------------------------------------ *
 * Choosing a food for a name
 * ------------------------------------------------------------------ */

/** A match is strong when most of the words in the name were found, the score is real, and no rival is equally good. */
export const MATCH_MIN_COVERAGE = 0.6;
export const MATCH_MIN_SCORE = 1.5;
const AMBIGUITY_RATIO = 0.92;

export interface FoodMatch {
  food: Food;
  score: number;
  coverage: number;
  exact: boolean;
}

export function bestFoodMatch(retriever: Retriever<Food>, name: string): FoodMatch | null {
  const hits = retriever.search(name, { limit: 2 });
  const top = hits[0];
  if (!top) return null;
  if (top.coverage < MATCH_MIN_COVERAGE || top.score < MATCH_MIN_SCORE) return null;
  const second = hits[1];
  if (!top.exact && second && second.score >= top.score * AMBIGUITY_RATIO) return null;
  return { food: top.doc, score: top.score, coverage: top.coverage, exact: top.exact };
}

/* ------------------------------------------------------------------ *
 * Guidance for flags
 * ------------------------------------------------------------------ */

export const FLAG_QUERIES: Record<Flag, string> = {
  'low-protein': 'protein fullness lean protein satiety',
  'high-sugar': 'added sugar sweet drinks liquid calories',
  'low-fiber': 'fiber vegetables whole grains beans',
  'high-energy-density': 'energy density calorie dense fried oil sauces portion',
  'over-budget': 'portion size calories budget plan the day',
  allergen: 'allergen labels ingredients check',
  'light-meal': 'light meal skipping meals snack protein',
};

export const GENERAL_QUERY = 'eating slowly consistency water habits balanced';
