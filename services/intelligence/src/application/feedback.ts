import { Feedback, type Citation, type FeedbackRequest, type Flag, type Totals } from '@leanplate/contracts';
import { log } from '@leanplate/platform';
import { AppError } from '@leanplate/security';
import type { Guidance } from '../domain/knowledge/types';
import type { FeedbackRephraser } from './ports';
import { FLAG_QUERIES, GENERAL_QUERY, type Retriever } from './retrieval';

export const MAX_TIPS = 3;
const MAX_TIP_CHARS = 220;
const MAX_HEADLINE_CHARS = 140;

/** Most important first: safety, then the budget, then the nutrients. */
const FLAG_ORDER: Flag[] = ['allergen', 'over-budget', 'high-sugar', 'low-protein', 'low-fiber', 'high-energy-density', 'light-meal'];

const r = Math.round;

const LEADS: Record<Flag, (t: Totals) => string> = {
  allergen: () => 'One food here may match something on your allergen list.',
  'over-budget': (t) => `This meal is about ${r(t.kcal)} kcal, which uses a good share of your day.`,
  'high-sugar': (t) => `There are about ${r(t.sugarG)} g of sugar here.`,
  'low-protein': (t) => `Protein is on the light side here, at about ${r(t.proteinG)} g.`,
  'low-fiber': (t) => `Fiber is on the low side here, at about ${r(t.fiberG)} g.`,
  'high-energy-density': () => 'This meal is packed with calories for its size.',
  'light-meal': (t) => `This is a light meal, at about ${r(t.kcal)} kcal.`,
};

const HEADLINES = {
  'on-track': 'Nice choice. This meal fits well with your plan.',
  okay: 'This is a solid meal, and a small tweak could make it even better.',
  'off-track': 'One meal does not define your day. Here are easy ways to balance it out.',
} as const;
const ALLERGEN_HEADLINE = 'Please double-check this meal against your allergen list.';

export function firstSentence(text: string): string {
  const m = /^.*?[.!?](?=\s|$)/.exec(text.trim());
  return (m ? m[0] : text).trim();
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${cut.slice(0, space > 40 ? space : cut.length).trimEnd()}.`;
}

/** Wording that must never appear in warm feedback: shaming, or claims about health outcomes. */
const FORBIDDEN =
  /\b(bad|lazy|guilt|guilty|shame|ashamed|disgust\w*|pathetic|fail\w*|cheat\w*|sin|sinful|junk|fat shaming|diagnos\w*|cure[sd]?|disease|medicat\w*|prescri\w*|treat(?:s|ed|ment)?|therap\w*|clinical\w*|guarantee\w*|miracle|detox)\b|https?:|www\.|<[^>]*>/i;

/**
 * A rephrased version is accepted only if it keeps the same shape, stays short,
 * adds no number that was not in the source, and contains nothing shaming,
 * medical or link-like. Otherwise the template feedback is used.
 */
export function acceptRephrase(
  template: { headline: string; tips: string[] },
  out: { headline: string; tips: string[] },
  snippets: { text: string }[],
): boolean {
  if (out.tips.length !== template.tips.length) return false;
  if (out.headline.trim().length === 0 || out.headline.length > MAX_HEADLINE_CHARS) return false;
  if (out.tips.some((t) => t.trim().length === 0 || t.length > MAX_TIP_CHARS)) return false;

  const all = [out.headline, ...out.tips];
  if (all.some((s) => FORBIDDEN.test(s))) return false;

  const source = [template.headline, ...template.tips, ...snippets.map((s) => s.text)].join(' ');
  const allowed = new Set(source.match(/\d+(?:\.\d+)?/g) ?? []);
  for (const s of all) {
    for (const n of s.match(/\d+(?:\.\d+)?/g) ?? []) if (!allowed.has(n)) return false;
  }
  return true;
}

export class BuildFeedback {
  constructor(
    private readonly deps: { guidance: Retriever<Guidance>; rephraser: FeedbackRephraser | null },
  ) {}

  /** Picks at most one snippet per flag, then general habits if there is room to fill. */
  private choose(flags: Flag[]): Array<{ flag: Flag | null; snippet: Guidance }> {
    const ordered = FLAG_ORDER.filter((f) => flags.includes(f));
    const picked: Array<{ flag: Flag | null; snippet: Guidance }> = [];
    const used = new Set<string>();

    for (const flag of ordered) {
      if (picked.length >= MAX_TIPS) break;
      const hit = this.deps.guidance.search(FLAG_QUERIES[flag], { limit: 1, filter: (g) => g.tags.includes(flag) && !used.has(g.id) })[0];
      if (hit) {
        used.add(hit.doc.id);
        picked.push({ flag, snippet: hit.doc });
      }
    }

    const want = Math.min(MAX_TIPS, Math.max(2, picked.length));
    if (picked.length < want) {
      const general = this.deps.guidance.search(GENERAL_QUERY, { limit: want - picked.length, filter: (g) => g.tags.length === 0 && !used.has(g.id) });
      for (const h of general) picked.push({ flag: null, snippet: h.doc });
    }
    return picked;
  }

  async run(req: FeedbackRequest): Promise<Feedback> {
    const picks = this.choose(req.flags);
    if (picks.length === 0) throw new AppError(500, 'internal', 'Something went wrong');

    const tips = picks.map(({ flag, snippet }) => {
      const body = firstSentence(snippet.text);
      return clip(flag ? `${LEADS[flag](req.totals)} ${body}` : body, MAX_TIP_CHARS);
    });
    const template = { headline: req.flags.includes('allergen') ? ALLERGEN_HEADLINE : HEADLINES[req.label], tips };
    const snippets = picks.map(({ snippet }) => ({ id: snippet.id, text: snippet.text }));

    let final = template;
    if (this.deps.rephraser) {
      try {
        const out = await this.deps.rephraser.rephrase({ ...template, snippets });
        if (acceptRephrase(template, out, snippets)) final = { headline: out.headline.trim(), tips: out.tips.map((t) => t.trim()) };
        else log.warn('rephrase rejected, using template');
      } catch {
        log.warn('rephrase failed, using template');
      }
    }

    const citations: Citation[] = picks.map(({ snippet }) => ({ id: snippet.id, title: snippet.title, snippet: snippet.text }));
    const parsed = Feedback.safeParse({ headline: final.headline, tips: final.tips, citations });
    if (!parsed.success) {
      const fallback = Feedback.parse({ headline: template.headline, tips: template.tips, citations });
      return fallback;
    }
    return parsed.data;
  }
}
