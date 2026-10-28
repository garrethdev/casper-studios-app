import {
  sumTotals,
  type AnalyzeMealBody,
  type AnalyzeMealResult,
  type DaySummary,
  type Feedback,
  type MealRecord,
  type Profile,
  type ProfileInput,
  type SaveMealBody,
  type Targets,
  type Totals,
} from '@leanplate/contracts';
import { AppError, newId } from '@leanplate/security';
import { log } from '@leanplate/platform';
import { addDays, dayRange, isDateString, localDate } from '../domain/days';
import { verifyItems } from '../domain/integrity';
import { computeTargets } from '../domain/targets';
import { scoreMeal } from '../domain/verdict';
import type { Caller, Clock, Intelligence, MealRepo, ProfileRepo, UsageRepo } from './ports';

const MAX_PAST_DAYS = 14;
const MAX_FUTURE_MS = 10 * 60_000;

export class MealService {
  constructor(
    private profiles: ProfileRepo,
    private meals: MealRepo,
    private ai: Intelligence,
    private clock: Clock,
    private usage: UsageRepo,
    private analysesPerHour: number,
  ) {}

  /* ---------- profile ---------- */

  async saveProfile(userId: string, input: ProfileInput): Promise<{ profile: Profile; targets: Targets }> {
    const { acceptedDisclaimer: _accepted, ...rest } = input;
    const targets = computeTargets(rest);
    const profile = await this.profiles.upsert(userId, rest, this.clock.now());
    return { profile, targets };
  }

  async getProfile(userId: string): Promise<Profile> {
    const p = await this.profiles.get(userId);
    if (!p) throw new AppError(404, 'no_profile', 'Finish onboarding first');
    return p;
  }

  async getTargets(userId: string): Promise<Targets> {
    return computeTargets(await this.getProfile(userId));
  }

  /* ---------- meals ---------- */

  /** Runs the AI pipeline and a draft verdict. Nothing is stored. */
  async analyze(who: Caller, body: AnalyzeMealBody): Promise<AnalyzeMealResult> {
    const profile = await this.getProfile(who.userId);
    const targets = computeTargets(profile);
    const now = this.clock.now();
    if ((await this.usage.increment(who.userId, now)) > this.analysesPerHour) {
      const wait = 3600 - Math.floor((now.getTime() % 3_600_000) / 1000);
      throw new AppError(429, 'rate_limited', 'You have reached the hourly limit for photo and text analysis. Try again soon.', { 'Retry-After': String(wait) });
    }
    const analysis = await this.ai.analyze({ image: body.image, text: body.text, allergens: profile.allergens, diet: profile.diet }, who);

    const date = body.date && isDateString(body.date) ? body.date : localDate(now, body.tzOffsetMinutes);
    const dayKcalBefore = await this.kcalOnDay(who.userId, date, body.tzOffsetMinutes);
    const totals = sumTotals(analysis.items);
    const verdict = scoreMeal({ mealType: body.mealType, items: analysis.items, totals, targets, dayKcalBefore, userAllergens: profile.allergens });
    const feedback = await this.feedbackFor(who, totals, verdict.label, verdict.flags);
    return { analysis: { ...analysis, totals }, verdict, feedback: feedback ?? { headline: 'Here is your breakdown.', tips: [], citations: [] } };
  }

  /** Saves a meal. Totals and verdict are always recomputed here from the items. */
  async save(who: Caller, body: SaveMealBody): Promise<{ meal: MealRecord; created: boolean }> {
    const profile = await this.getProfile(who.userId);
    const targets = computeTargets(profile);

    const eatenAt = new Date(body.eatenAt);
    const now = this.clock.now();
    if (eatenAt.getTime() > now.getTime() + MAX_FUTURE_MS) throw new AppError(422, 'invalid_time', 'A meal cannot be in the future');
    if (eatenAt.getTime() < now.getTime() - MAX_PAST_DAYS * 86_400_000) throw new AppError(422, 'invalid_time', `Meals can be logged up to ${MAX_PAST_DAYS} days back`);

    const { items } = verifyItems(body.items);
    const totals = sumTotals(items);
    const date = localDate(eatenAt, body.tzOffsetMinutes);
    const { start, end } = dayRange(date, body.tzOffsetMinutes);
    const sameDay = (await this.meals.between(who.userId, start, end)).filter((m) => new Date(m.eatenAt) < eatenAt);
    const dayKcalBefore = sameDay.reduce((s, m) => s + m.totals.kcal, 0);
    const verdict = scoreMeal({ mealType: body.mealType, items, totals, targets, dayKcalBefore, userAllergens: profile.allergens });
    const feedback = await this.feedbackFor(who, totals, verdict.label, verdict.flags);

    const meal: MealRecord = {
      id: newId(),
      eatenAt: eatenAt.toISOString(),
      mealType: body.mealType,
      items,
      totals,
      verdict,
      feedback,
      note: body.note?.trim() ? body.note.trim() : null,
    };
    return this.meals.insert(who.userId, meal, body.idempotencyKey);
  }

  async list(userId: string, date: string, tz: number): Promise<MealRecord[]> {
    const { start, end } = dayRange(this.checkDate(date), tz);
    return this.meals.between(userId, start, end);
  }

  async remove(userId: string, id: string): Promise<void> {
    if (!/^[0-9a-f-]{36}$/i.test(id) || !(await this.meals.delete(userId, id))) throw new AppError(404, 'not_found', 'Meal not found');
  }

  async summary(userId: string, date: string, tz: number): Promise<DaySummary> {
    this.checkDate(date);
    const targets = await this.getTargets(userId);
    const weekStart = addDays(date, -6);
    const { start } = dayRange(weekStart, tz);
    const { end } = dayRange(date, tz);
    const meals = await this.meals.between(userId, start, end);

    const perDay = new Map<string, number>();
    for (let i = 0; i < 7; i++) perDay.set(addDays(weekStart, i), 0);
    const today: MealRecord[] = [];
    for (const m of meals) {
      const d = localDate(m.eatenAt, tz);
      perDay.set(d, (perDay.get(d) ?? 0) + m.totals.kcal);
      if (d === date) today.push(m);
    }
    const consumed: Totals = sumTotals(today.flatMap((m) => m.items));
    return {
      date,
      targets,
      consumed,
      remainingKcal: targets.dailyKcal - consumed.kcal,
      mealCount: today.length,
      onTrackCount: today.filter((m) => m.verdict.label === 'on-track').length,
      week: [...perDay].map(([d, kcal]) => ({ date: d, kcal: Math.round(kcal) })),
    };
  }

  async eraseAll(userId: string): Promise<void> {
    await this.meals.deleteAll(userId);
    await this.profiles.delete(userId);
  }

  /* ---------- helpers ---------- */

  private checkDate(date: string): string {
    if (!isDateString(date)) throw new AppError(400, 'invalid_request', 'date must look like 2026-10-26');
    return date;
  }

  private async kcalOnDay(userId: string, date: string, tz: number): Promise<number> {
    const { start, end } = dayRange(date, tz);
    return (await this.meals.between(userId, start, end)).reduce((s, m) => s + m.totals.kcal, 0);
  }

  /** Tips are a nice-to-have: if the AI service is down, the meal still saves. */
  private async feedbackFor(who: Caller, totals: Totals, label: 'on-track' | 'okay' | 'off-track', flags: Parameters<Intelligence['feedback']>[0]['flags']): Promise<Feedback | null> {
    try {
      return await this.ai.feedback({ totals, label, flags }, who);
    } catch (e) {
      log.warn('feedback_unavailable', { code: (e as AppError).code });
      return null;
    }
  }
}
