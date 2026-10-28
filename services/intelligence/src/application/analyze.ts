import { Analysis, type AnalyzeRequest } from '@leanplate/contracts';
import { AppError } from '@leanplate/security';
import type { Food } from '../domain/knowledge/types';
import { groundItems } from './ground';
import type { MealAnalyzer } from './ports';
import { preprocess } from './preprocess';
import type { Retriever } from './retrieval';
import { parseDetection, validateItems } from './validate';

export interface AnalyzeDeps {
  /** Reads photos. Null when no API key is configured. */
  vision: MealAnalyzer | null;
  /** Reads descriptions typed in words. Always available. */
  text: MealAnalyzer;
  foods: Retriever<Food>;
}

export const AI_UNAVAILABLE_MESSAGE = 'Photo analysis is not available right now. You can describe the meal in words instead.';

/**
 * The whole analysis pipeline:
 * pre-process -> analyze (port) -> strict check -> ground in the knowledge base -> validate -> Analysis.
 */
export class AnalyzeMeal {
  constructor(private readonly deps: AnalyzeDeps) {}

  /** A photo needs the vision model (with the text as a hint); text alone uses the deterministic parser. */
  private pick(req: AnalyzeRequest): MealAnalyzer {
    if (!req.image) return this.deps.text;
    if (!this.deps.vision) throw new AppError(503, 'ai_unavailable', AI_UNAVAILABLE_MESSAGE);
    return this.deps.vision;
  }

  async run(req: AnalyzeRequest): Promise<Analysis> {
    const analyzer = this.pick(req);
    const prepared = await preprocess(req);

    const raw = await analyzer.analyze(prepared);
    const detection = parseDetection(raw);

    const source = analyzer.provider === 'anthropic' ? 'vision' : 'text';
    const grounded = groundItems(detection.items, source, this.deps.foods);
    const checked = validateItems(grounded.items, { allergens: req.allergens, diet: req.diet });

    const warnings = [...checked.warnings];
    if (prepared.textSuspicious) {
      warnings.push('Part of your description looked like instructions, so it was treated only as a description of food.');
    }

    const used = new Set(checked.items.map((i) => i.kbId).filter((id): id is string => !!id));
    const result = Analysis.safeParse({
      items: checked.items,
      totals: checked.totals,
      warnings,
      citations: grounded.citations.filter((c) => used.has(c.id)),
      provider: analyzer.provider,
    });
    if (!result.success) throw new AppError(422, 'analysis_failed', 'We could not read that analysis. Please try again, or describe the meal in words.');
    return result.data;
  }
}
