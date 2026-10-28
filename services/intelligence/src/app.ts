import type { Hono } from 'hono';
import { createApp } from '@leanplate/platform';
import { serviceAuth, serviceSecret, type AuthEnv } from '@leanplate/security';
import { AnalyzeMeal } from './application/analyze';
import { BuildFeedback } from './application/feedback';
import type { FeedbackRephraser, MealAnalyzer } from './application/ports';
import { createFoodRetriever, createGuidanceRetriever, type Retriever } from './application/retrieval';
import type { Food, Guidance } from './domain/knowledge/types';
import { intelligenceRoutes } from './http/routes';
import { AnthropicVisionAnalyzer, DEFAULT_MODEL } from './infrastructure/anthropic';
import { AnthropicFeedbackRephraser } from './infrastructure/anthropic-feedback';
import { TextMealAnalyzer } from './infrastructure/text-parser';

export interface Deps {
  /** Reads photos. Defaults to the Anthropic adapter when ANTHROPIC_API_KEY is set, otherwise null (photos get a 503). */
  vision: MealAnalyzer | null;
  /** Reads typed descriptions. Defaults to the deterministic parser. */
  text: MealAnalyzer;
  foods: Retriever<Food>;
  guidance: Retriever<Guidance>;
  /** Optional warm rewording of feedback. Defaults to the Anthropic adapter when a key is set. */
  rephraser: FeedbackRephraser | null;
  /** Used by the default Anthropic adapters, so tests can run offline. */
  fetch: typeof fetch;
  apiKey: string | undefined;
  model: string;
  /** Secret that guards this service. Defaults to SERVICE_SECRET_INTELLIGENCE. */
  serviceSecret: string;
}

/** Photos can be up to 4.5 MB of base64, so the body limit sits just above that. */
const MAX_BODY_BYTES = Math.ceil(4.6 * 1024 * 1024);

export async function buildApp(deps: Partial<Deps> = {}): Promise<Hono<AuthEnv>> {
  const apiKey = 'apiKey' in deps ? deps.apiKey : process.env.ANTHROPIC_API_KEY?.trim() || undefined;
  const model = deps.model ?? (process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL);
  const doFetch = deps.fetch ?? fetch;
  const secret = deps.serviceSecret ?? serviceSecret('intelligence');

  const foods = deps.foods ?? createFoodRetriever();
  const guidance = deps.guidance ?? createGuidanceRetriever();
  const anthropic = apiKey ? { apiKey, model, fetch: doFetch } : null;

  const vision = 'vision' in deps ? (deps.vision ?? null) : anthropic ? new AnthropicVisionAnalyzer(anthropic) : null;
  const rephraser = 'rephraser' in deps ? (deps.rephraser ?? null) : anthropic ? new AnthropicFeedbackRephraser(anthropic) : null;
  const text = deps.text ?? new TextMealAnalyzer(foods);

  const app = createApp('intelligence', { maxBodyBytes: MAX_BODY_BYTES });
  app.route(
    '/',
    intelligenceRoutes({
      analyze: new AnalyzeMeal({ vision, text, foods }),
      feedback: new BuildFeedback({ guidance, rephraser }),
      serviceAuth: serviceAuth({ secret: () => secret, audience: 'intelligence', allowedIssuers: ['meals'] }),
    }),
  );
  return app;
}
