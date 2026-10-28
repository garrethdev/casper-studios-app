import type { Analysis, AnalyzeMealBody, Feedback, FeedbackRequest, MealRecord, Profile, ProfileInput } from '@leanplate/contracts';

/** Every query is scoped by userId, which always comes from the verified token. */
export interface ProfileRepo {
  get(userId: string): Promise<Profile | null>;
  upsert(userId: string, input: Omit<ProfileInput, 'acceptedDisclaimer'>, now: Date): Promise<Profile>;
  delete(userId: string): Promise<void>;
}

export interface MealRepo {
  /** Inserts the meal unless this user already used the idempotency key, in which case the original is returned. */
  insert(userId: string, meal: MealRecord, idempotencyKey: string): Promise<{ meal: MealRecord; created: boolean }>;
  between(userId: string, from: Date, to: Date): Promise<MealRecord[]>;
  delete(userId: string, id: string): Promise<boolean>;
  deleteAll(userId: string): Promise<void>;
}

export interface Caller {
  userId: string;
  clientIpHash?: string;
  requestId?: string;
}

/** Counts paid AI analyses per user per hour. Must be atomic across instances. */
export interface UsageRepo {
  /** Increments the user's count for the hour containing `now` and returns the new value. */
  increment(userId: string, now: Date): Promise<number>;
}

/** The AI layer lives in its own service; this is how meals talks to it. */
export interface Intelligence {
  analyze(input: Pick<AnalyzeMealBody, 'image' | 'text'> & { allergens: ProfileInput['allergens']; diet: ProfileInput['diet'] }, who: Caller): Promise<Analysis>;
  feedback(input: FeedbackRequest, who: Caller): Promise<Feedback>;
}

export interface Clock {
  now(): Date;
}
