import { FOODS } from '../domain/knowledge/foods';
import type { Food } from '../domain/knowledge/types';
import { resolveGrams, type Unit } from '../domain/portions';
import type { RawDetection, RawItem } from '../domain/detection';
import type { MealAnalyzer, PreparedInput } from '../application/ports';
import { bestFoodMatch, stem, type Retriever } from '../application/retrieval';

/* ------------------------------------------------------------------ *
 * Lexing: numbers, words and separators
 * ------------------------------------------------------------------ */

type Tok = { kind: 'num'; value: number } | { kind: 'word'; w: string } | { kind: 'delim' };

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  couple: 2, pair: 2, few: 3,
};
const DELIM_WORDS = new Set(['and', 'with', 'plus', 'then', 'also', 'alongside', 'topped']);
const SIZE_WORDS: Record<string, number> = { tiny: 0.5, small: 0.75, little: 0.75, mini: 0.75, medium: 1, regular: 1, large: 1.25, big: 1.25, huge: 1.6, jumbo: 1.5 };
const UNIT_WORDS: Record<string, Unit> = {
  g: 'g', gram: 'g', gr: 'g', kg: 'kg', kilogram: 'kg', oz: 'oz', ounce: 'oz', lb: 'lb', lbs: 'lb', pound: 'lb',
  ml: 'ml', milliliter: 'ml', millilitre: 'ml', l: 'l', liter: 'l', litre: 'l',
  cup: 'cup', tbsp: 'tbsp', tbs: 'tbsp', tablespoon: 'tbsp', tsp: 'tsp', teaspoon: 'tsp',
  slice: 'slice', piece: 'piece', pc: 'piece', pcs: 'piece', bowl: 'bowl', glass: 'glass', can: 'can', handful: 'handful', scoop: 'scoop',
  serving: 'serving', portion: 'serving', plate: 'serving', helping: 'serving',
};
const FILLER = new Set(['of', 'the', 'some', 'about', 'around', 'roughly', 'approximately', 'approx', 'x', 'like', 'another', 'extra']);
/** Words that never name a food. */
const NON_CONTENT = new Set([
  ...FILLER, ...DELIM_WORDS, 'a', 'an', 'half', 'quarter', 'dozen',
  'for', 'breakfast', 'lunch', 'dinner', 'brunch', 'supper', 'snack', 'meal', 'today', 'this', 'morning', 'evening', 'night', 'tonight', 'earlier',
  'i', 'we', 'my', 'me', 'had', 'ate', 'have', 'having', 'eat', 'eating', 'was', 'were', 'is', 'it', 'just', 'only', 'bit', 'lot', 'lots', 'to', 'in', 'on', 'at',
  'delicious', 'tasty', 'yummy', 'good', 'nice', 'fresh', 'homemade', 'cooked', 'plain', 'side', 'order', 'sized', 'size',
  ...Object.keys(NUMBER_WORDS), ...Object.keys(SIZE_WORDS), ...Object.keys(UNIT_WORDS),
]);

function lex(text: string): Tok[] {
  const t = text
    .normalize('NFKC')
    .toLowerCase()
    .replace(new RegExp(String.fromCharCode(0x2044), 'g'), '/')
    .replace(/['’]/g, '');
  const out: Tok[] = [];
  for (const m of t.matchAll(/(\d+(?:\.\d+)?\s*\/\s*\d+|\d+(?:\.\d+)?|[a-z]+|[,;&+/])/g)) {
    const s = m[0];
    if (/^\d/.test(s)) {
      if (s.includes('/')) {
        const [a, b] = s.split('/').map((x) => parseFloat(x.trim()));
        if (a !== undefined && b) out.push({ kind: 'num', value: a / b });
      } else {
        out.push({ kind: 'num', value: parseFloat(s) });
      }
    } else if (/^[a-z]/.test(s)) {
      const w = NUMBER_WORDS[s] !== undefined ? s : UNIT_WORDS[s] !== undefined ? s : stem(s);
      out.push({ kind: 'word', w });
    } else {
      out.push({ kind: 'delim' });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Quantities
 * ------------------------------------------------------------------ */

interface Quantity {
  qty?: number;
  unit?: Unit;
  size: number;
}

function parseQuantity(toks: Tok[]): Quantity {
  let qty: number | undefined;
  let weak = false; // quantity came only from "a" or "an"
  let unit: Unit | undefined;
  let size = 1;
  for (const t of toks) {
    if (t.kind === 'num') {
      qty = qty !== undefined && !weak && Number.isInteger(qty) && qty >= 1 && t.value < 1 ? qty + t.value : t.value;
      weak = false;
      continue;
    }
    if (t.kind !== 'word') continue;
    const w = t.w;
    if (w === 'a' || w === 'an') {
      if (qty === undefined) {
        qty = 1;
        weak = true;
      }
    } else if (w === 'half' || w === 'quarter') {
      const v = w === 'half' ? 0.5 : 0.25;
      qty = qty === undefined || weak ? v : qty + v;
      weak = false;
    } else if (w === 'dozen') {
      qty = (qty ?? 1) * 12;
      weak = false;
    } else if (NUMBER_WORDS[w] !== undefined) {
      qty = NUMBER_WORDS[w];
      weak = false;
    } else if (UNIT_WORDS[w] !== undefined) {
      unit = UNIT_WORDS[w];
    } else if (SIZE_WORDS[w] !== undefined) {
      size = SIZE_WORDS[w]!;
    }
  }
  return { qty, unit, size };
}

const EXACT_UNITS = new Set<Unit>(['g', 'kg', 'oz', 'lb', 'ml', 'l']);

function isQuantityToken(t: Tok): boolean {
  if (t.kind === 'num') return true;
  if (t.kind !== 'word') return false;
  const w = t.w;
  return w === 'a' || w === 'an' || w === 'half' || w === 'quarter' || w === 'dozen' || NUMBER_WORDS[w] !== undefined || UNIT_WORDS[w] !== undefined || SIZE_WORDS[w] !== undefined || FILLER.has(w);
}

/** The run of quantity-looking tokens directly before `end`, not reaching back past `floor`. */
function quantityBefore(tokens: Tok[], end: number, floor: number): Tok[] {
  let i = end;
  while (i > floor && isQuantityToken(tokens[i - 1]!)) i--;
  return tokens.slice(i, end);
}

/** "chicken breast 150 g": a weight written after the food. */
function weightAfter(tokens: Tok[], from: number, ceil: number): Quantity | null {
  let start = from;
  while (start < ceil && tokens[start]!.kind === 'word' && FILLER.has((tokens[start] as { w: string }).w)) start++; // "(about 5 oz)"
  const a = tokens[start];
  const b = tokens[start + 1];
  if (start + 1 < ceil && a?.kind === 'num' && b?.kind === 'word') {
    const u = UNIT_WORDS[b.w];
    if (u && EXACT_UNITS.has(u)) return { qty: a.value, unit: u, size: 1 };
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Parsing a whole description
 * ------------------------------------------------------------------ */

interface Parsed {
  food: Food;
  grams: number;
  confidence: number;
}

const MAX_PHRASE = 7;

export interface TextParseResult {
  items: Parsed[];
  unmatched: string[];
}

export class MealTextParser {
  private readonly phrases = new Map<string, Food>();

  constructor(
    private readonly retriever: Retriever<Food>,
    foods: readonly Food[] = FOODS,
  ) {
    for (const f of foods) {
      for (const p of [f.name, ...f.aliases]) {
        const key = (p.normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase().replace(/['’]/g, '').match(/[a-z0-9]+/g) ?? []).map(stem).join(' ');
        if (key && !this.phrases.has(key)) this.phrases.set(key, f);
      }
    }
  }

  parse(text: string): TextParseResult {
    const tokens = lex(text);
    const n = tokens.length;

    // Pass 1: greedy longest match of known food names, left to right.
    const spans: { start: number; end: number; food: Food }[] = [];
    const covered = new Set<number>();
    for (let i = 0; i < n; ) {
      let hit = false;
      if (tokens[i]!.kind === 'word') {
        for (let len = Math.min(MAX_PHRASE, n - i); len >= 1; len--) {
          const slice = tokens.slice(i, i + len);
          if (!slice.every((t) => t.kind === 'word')) continue;
          const food = this.phrases.get(slice.map((t) => (t as { w: string }).w).join(' '));
          if (food) {
            spans.push({ start: i, end: i + len, food });
            for (let k = i; k < i + len; k++) covered.add(k);
            i += len;
            hit = true;
            break;
          }
        }
      }
      if (!hit) i++;
    }

    // Pass 2: split into segments at separators that are not inside a recognised food name.
    const isSep = (i: number) => {
      if (covered.has(i)) return false;
      const t = tokens[i]!;
      return t.kind === 'delim' || (t.kind === 'word' && DELIM_WORDS.has(t.w));
    };
    const segments: [number, number][] = [];
    let s = 0;
    for (let i = 0; i <= n; i++) {
      if (i === n || isSep(i)) {
        if (i > s) segments.push([s, i]);
        s = i + 1;
      }
    }

    const found: Parsed[] = [];
    const unmatched: string[] = [];

    for (const [a, b] of segments) {
      const inSeg = spans.filter((sp) => sp.start >= a && sp.end <= b);
      if (inSeg.length > 0) {
        let floor = a;
        inSeg.forEach((sp, k) => {
          const nextStart = inSeg[k + 1]?.start ?? b;
          let q = parseQuantity(quantityBefore(tokens, sp.start, floor));
          let explicit = q.qty !== undefined || q.unit !== undefined;
          if (!explicit) {
            const after = weightAfter(tokens, sp.end, nextStart);
            if (after) {
              q = after;
              explicit = true;
            }
          }
          const { grams } = resolveGrams(sp.food, q);
          found.push({ food: sp.food, grams, confidence: explicit ? 0.9 : 0.8 });
          floor = sp.end;
        });
        continue;
      }

      // No known name here: try ranked retrieval on the words that could be a food.
      const seg = tokens.slice(a, b);
      const content = seg.filter((t): t is { kind: 'word'; w: string } => t.kind === 'word' && !NON_CONTENT.has(t.w)).map((t) => t.w);
      if (content.length === 0) continue;
      const match = bestFoodMatch(this.retriever, content.join(' '));
      if (!match) {
        unmatched.push(content.join(' '));
        continue;
      }
      const q = parseQuantity(seg.filter((t) => t.kind !== 'word' || NON_CONTENT.has(t.w)));
      const { grams } = resolveGrams(match.food, q);
      found.push({ food: match.food, grams, confidence: 0.6 });
    }

    // The same food mentioned twice becomes one line.
    const merged = new Map<string, Parsed>();
    for (const p of found) {
      const prev = merged.get(p.food.id);
      if (prev) {
        prev.grams = Math.min(2000, prev.grams + p.grams);
        prev.confidence = Math.min(prev.confidence, p.confidence);
      } else {
        merged.set(p.food.id, { ...p });
      }
    }
    return { items: [...merged.values()].slice(0, 20), unmatched };
  }
}

/** Deterministic analyzer for descriptions typed in words. It needs no network and no API key. */
export class TextMealAnalyzer implements MealAnalyzer {
  readonly provider = 'text-parser' as const;
  private readonly parser: MealTextParser;

  constructor(retriever: Retriever<Food>, foods: readonly Food[] = FOODS) {
    this.parser = new MealTextParser(retriever, foods);
  }

  async analyze(input: PreparedInput): Promise<RawDetection> {
    const { items, unmatched } = this.parser.parse(input.text ?? '');
    const raw: RawItem[] = items.map(({ food, grams, confidence }) => {
      const f = grams / 100;
      const p = food.per100g;
      return {
        name: food.name,
        grams,
        kcal: Math.round(p.kcal * f),
        proteinG: round1(p.proteinG * f),
        carbsG: round1(p.carbsG * f),
        fatG: round1(p.fatG * f),
        fiberG: round1(p.fiberG * f),
        sugarG: round1(p.sugarG * f),
        confidence,
      };
    });
    const notes = unmatched.length > 0 ? `Could not identify: ${unmatched.join(', ')}`.slice(0, 380) : '';
    return { isFood: raw.length > 0, items: raw, notes };
  }
}

const round1 = (n: number) => Math.round(n * 10) / 10;
