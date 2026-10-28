import { describe, expect, it } from 'vitest';
import { explainFailure } from '../lib/errors-ui';
import { MAX_BASE64, base64Length, fitWithin } from '../lib/image-fit';
import { friendlyName } from '../lib/names';
import { passwordRules } from '../lib/password-rules';
import { isAppPage, safeNext } from '../lib/routing';
import { defaultMealType } from '../lib/meal-type';
import { localDate, weekdayShort } from '../lib/dates';

describe('image sizing', () => {
  it('shrinks the long side to 1280 and keeps the aspect ratio', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1280, height: 960 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 960, height: 1280 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(0, 100)).toEqual({ width: 0, height: 0 });
    expect(fitWithin(10000, 1)).toEqual({ width: 1280, height: 1 });
  });
  it('base64 length matches the contract limit math', () => {
    expect(base64Length(3)).toBe(4);
    expect(base64Length(1)).toBe(4);
    expect(base64Length(3_375_000)).toBeLessThanOrEqual(MAX_BASE64);
  });
});

describe('friendly errors', () => {
  const f = (status: number, code: string, message = 'm') => ({ status, code, message });
  it('analysis 429 and 502 use the polite helper-is-busy wording', () => {
    expect(explainFailure(f(429, 'rate_limited', 'Too many requests'), 'analyze')).toBe('The AI helper is busy. Try again in a moment, or describe the meal in words.');
    expect(explainFailure(f(502, 'upstream_error'), 'analyze')).toBe('The AI helper is busy. Try again in a moment, or describe the meal in words.');
  });
  it('ai_unavailable suggests a text description', () => {
    expect(explainFailure(f(503, 'ai_unavailable'), 'analyze')).toMatch(/describing the meal in words/);
    expect(explainFailure(f(422, 'ai_unavailable'), 'analyze')).toMatch(/words/);
  });
  it('passes meaningful upstream messages through and never shows a 500 detail', () => {
    expect(explainFailure(f(422, 'implausible_meal', 'A single meal of 5000 kcal looks wrong. Check the portions.'), 'save')).toMatch(/5000 kcal/);
    expect(explainFailure(f(500, 'internal', 'stack trace'), 'save')).not.toMatch(/stack/);
    expect(explainFailure(f(0, 'network'))).toMatch(/connection/);
  });
});

describe('routing and small helpers', () => {
  it('knows which pages need a session', () => {
    expect(isAppPage('/dashboard')).toBe(true);
    expect(isAppPage('/meals/new')).toBe(true);
    expect(isAppPage('/')).toBe(false);
    expect(isAppPage('/dashboardx')).toBe(false);
  });
  it('safeNext only allows known in-app paths (no open redirects)', () => {
    expect(safeNext('/dashboard')).toBe('/dashboard');
    expect(safeNext('/meals/new?x=1')).toBe('/meals/new');
    for (const bad of ['//evil.test', 'https://evil.test', '/\\evil', '/api/me', '/', '', null, undefined, 'dashboard']) expect(safeNext(bad as string)).toBeNull();
  });
  it('password hints mirror the visible rules', () => {
    expect(passwordRules('short', 'a@b.co').lengthOk).toBe(false);
    expect(passwordRules('a-long-enough-phrase', 'a@b.co')).toEqual({ lengthOk: true, variedOk: true, noEmailOk: true });
    expect(passwordRules('garreth-is-my-name', 'garreth@x.co').noEmailOk).toBe(false);
    expect(passwordRules('aaaaaaaaaaaaaaaa', 'a@b.co').variedOk).toBe(false);
  });
  it('friendly names', () => {
    expect(friendlyName('sam.lee42@x.com')).toBe('Sam');
    expect(friendlyName('42@x.com')).toBe('');
    expect(friendlyName('x@x.com')).toBe('');
  });
  it('dates', () => {
    expect(localDate(new Date(2026, 9, 5))).toBe('2026-10-05');
    expect(weekdayShort('2026-10-26')).toBe('Mon');
    expect(defaultMealType(new Date(2026, 9, 5, 8))).toBe('breakfast');
    expect(defaultMealType(new Date(2026, 9, 5, 12))).toBe('lunch');
    expect(defaultMealType(new Date(2026, 9, 5, 19))).toBe('dinner');
    expect(defaultMealType(new Date(2026, 9, 5, 23))).toBe('snack');
  });
});
