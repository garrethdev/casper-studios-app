/** Turns API failures into calm, specific sentences. Pure so it can be tested. */
export interface Failure {
  status: number;
  code: string;
  message: string;
}

export type FailureContext = 'analyze' | 'save' | 'auth' | 'generic';

const BUSY = 'The AI helper is busy. Try again in a moment, or describe the meal in words.';

export function explainFailure(f: Failure, context: FailureContext = 'generic'): string {
  if (f.code === 'network') return 'We could not reach Leanplate. Check your connection and try again.';
  if (context === 'analyze') {
    if (f.code === 'ai_unavailable' || f.status === 503) return 'Photo analysis is not available right now. Try describing the meal in words instead.';
    if (f.status === 429) return f.code === 'rate_limited' && /hourly/i.test(f.message) ? f.message : BUSY;
    if (f.status === 502 || f.status === 504 || f.code === 'upstream_unavailable' || f.code === 'upstream_error') return BUSY;
    if (f.code === 'not_food') return 'That does not look like food. Try another photo, or describe the meal in words.';
    if (f.status === 413) return 'That photo is too large. Try a smaller one, or describe the meal in words.';
  }
  if (f.status === 429) return context === 'auth' ? 'Too many tries. Please wait a minute and try again.' : 'Please slow down for a moment and try again.';
  if (f.status === 502 || f.status === 503 || f.status === 504) return 'Something is not responding right now. Please try again in a moment.';
  if (f.status >= 500) return 'Something went wrong on our side. Please try again.';
  return f.message || 'Something went wrong. Please try again.';
}
