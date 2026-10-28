import type { Profile, Targets } from '@leanplate/contracts';

const ACTIVITY = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725 } as const;
const PACE_KG_PER_WEEK = { gentle: 0.25, steady: 0.5, faster: 0.75 } as const;
const KCAL_PER_KG = 7700;
const MIN_BMI = 18.5;

type Body = Pick<Profile, 'sex' | 'age' | 'heightCm' | 'weightKg' | 'targetWeightKg' | 'activity' | 'pace'>;

/** Mifflin-St Jeor resting energy, kcal per day. */
export function bmr(p: Pick<Body, 'sex' | 'age' | 'heightCm' | 'weightKg'>): number {
  return 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + (p.sex === 'male' ? 5 : -161);
}

/**
 * Turns a profile into daily targets. The plan is deliberately conservative:
 * the deficit is capped at 25% of maintenance, calories never drop below a
 * safety floor, and a goal weight under a BMI of 18.5 is not planned for.
 */
export function computeTargets(p: Body): Targets {
  const notes: string[] = [];
  const rest = bmr(p);
  const tdee = rest * ACTIVITY[p.activity];

  const heightM = p.heightCm / 100;
  const minGoalKg = MIN_BMI * heightM * heightM;
  let goalKg = p.targetWeightKg;
  if (goalKg < minGoalKg) {
    goalKg = Math.ceil(minGoalKg);
    notes.push(`Your goal weight is below a healthy range for your height, so this plan aims for ${goalKg} kg instead. A doctor can help you set a lower goal safely.`);
  }

  const losing = goalKg < p.weightKg - 0.5;
  let deficit = 0;
  let dailyKcal = tdee;

  if (losing) {
    deficit = (PACE_KG_PER_WEEK[p.pace] * KCAL_PER_KG) / 7;
    const cap = tdee * 0.25;
    if (deficit > cap) {
      deficit = cap;
      notes.push('Your pace was reduced so the daily deficit stays within 25% of what your body uses.');
    }
    const floor = p.sex === 'male' ? 1500 : 1200;
    if (tdee - deficit < floor) {
      deficit = Math.max(0, tdee - floor);
      notes.push(`Your daily calories are held at ${floor} or above, which is the lowest this app will suggest without a doctor.`);
    }
    dailyKcal = tdee - deficit;
  } else {
    notes.push('You are at or near your goal weight, so these targets are for keeping your weight steady.');
  }

  const weeksToGoal = losing && deficit > 0 ? Math.ceil((p.weightKg - goalKg) / ((deficit * 7) / KCAL_PER_KG)) : null;
  const refKg = Math.min(p.weightKg, Math.max(goalKg, p.weightKg * 0.85));
  const proteinG = Math.round(Math.min(180, Math.max(60, refKg * (losing ? 1.6 : 1.2))));

  return {
    mode: losing ? 'lose' : 'maintain',
    bmr: Math.round(rest),
    tdee: Math.round(tdee),
    dailyKcal: Math.round(dailyKcal),
    deficitKcal: Math.round(deficit),
    proteinG,
    fiberG: Math.max(25, Math.round((dailyKcal / 1000) * 14)),
    sugarCapG: Math.round((dailyKcal * 0.15) / 4),
    weeksToGoal,
    notes,
  };
}
