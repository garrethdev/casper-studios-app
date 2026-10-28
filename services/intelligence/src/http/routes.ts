import { Hono, type MiddlewareHandler } from 'hono';
import { Analysis, AnalyzeRequest, Feedback, FeedbackRequest } from '@leanplate/contracts';
import { log, parseBody } from '@leanplate/platform';
import { AppError, type AuthEnv } from '@leanplate/security';
import type { AnalyzeMeal } from '../application/analyze';
import type { BuildFeedback } from '../application/feedback';

export interface RouteDeps {
  analyze: AnalyzeMeal;
  feedback: BuildFeedback;
  /** Runs on every /v1 route: only the meals service, holding the intelligence secret, gets through. */
  serviceAuth: MiddlewareHandler<AuthEnv>;
}

export function intelligenceRoutes({ analyze, feedback, serviceAuth }: RouteDeps) {
  const r = new Hono<AuthEnv>();
  r.use('/v1/*', serviceAuth);

  r.post('/v1/analyze', async (c) => {
    const body = await parseBody(c, AnalyzeRequest);
    const started = Date.now();
    const analysis = await analyze.run(body);
    // Validated against the contract one more time on the way out: nothing unchecked leaves this service.
    const out = Analysis.safeParse(analysis);
    if (!out.success) throw new AppError(422, 'analysis_failed', 'We could not read that analysis. Please try again, or describe the meal in words.');
    log.info('analyzed', { provider: out.data.provider, items: out.data.items.length, warnings: out.data.warnings.length, ms: Date.now() - started });
    return c.json(out.data);
  });

  r.post('/v1/feedback', async (c) => {
    const body = await parseBody(c, FeedbackRequest);
    const result = await feedback.run(body);
    const out = Feedback.safeParse(result);
    if (!out.success) throw new AppError(500, 'internal', 'Something went wrong');
    return c.json(out.data);
  });

  return r;
}
