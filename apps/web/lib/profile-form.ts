import { ProfileInput, type Allergen, type Profile } from '@leanplate/contracts';
import { cmToFtIn, ftInToCm, kgToLb, lbToKg, parseDecimal, round1 } from './units';

type Sex = 'female' | 'male';
type ActivityT = 'sedentary' | 'light' | 'moderate' | 'active';
type Pace = 'gentle' | 'steady' | 'faster';
type Diet = 'none' | 'vegetarian' | 'vegan' | 'pescatarian';

export const PACE_KG: Record<Pace, number> = { gentle: 0.25, steady: 0.5, faster: 0.75 };

export interface WizardForm {
  sex: Sex | '';
  age: string;
  heightUnit: 'cm' | 'ftin';
  heightCm: string;
  heightFt: string;
  heightIn: string;
  weightUnit: 'kg' | 'lb';
  /** Current and target weight are both held in the chosen weightUnit. */
  weight: string;
  target: string;
  activity: ActivityT | '';
  pace: Pace | '';
  diet: Diet;
  allergens: Allergen[];
  accepted: boolean;
}

export type FieldErrors = Partial<Record<'sex' | 'age' | 'height' | 'weight' | 'activity' | 'target' | 'pace' | 'diet' | 'allergens' | 'accepted', string>>;

export function emptyForm(): WizardForm {
  return {
    sex: '', age: '', heightUnit: 'cm', heightCm: '', heightFt: '', heightIn: '', weightUnit: 'kg', weight: '', target: '',
    activity: '', pace: '', diet: 'none', allergens: [], accepted: false,
  };
}

/** Pre-fills the form from a saved profile (settings screen). The disclaimer must be accepted again on save. */
export function formFromProfile(p: Profile): WizardForm {
  const ftin = cmToFtIn(p.heightCm);
  return {
    ...emptyForm(),
    sex: p.sex,
    age: String(p.age),
    heightCm: String(p.heightCm),
    heightFt: ftin ? String(ftin.ft) : '',
    heightIn: ftin ? String(ftin.inch) : '',
    weight: String(p.weightKg),
    target: String(p.targetWeightKg),
    activity: p.activity,
    pace: p.pace,
    diet: p.diet,
    allergens: p.allergens,
  };
}

export function heightToCm(f: WizardForm): number | null {
  if (f.heightUnit === 'cm') return parseDecimal(f.heightCm);
  const ft = parseDecimal(f.heightFt);
  const inch = f.heightIn.trim() === '' ? 0 : parseDecimal(f.heightIn);
  if (ft === null || inch === null) return null;
  return ftInToCm(ft, inch);
}

export function weightToKg(f: WizardForm, text: string): number | null {
  const n = parseDecimal(text);
  if (n === null) return null;
  return f.weightUnit === 'kg' ? round1(n) : lbToKg(n);
}

export function switchHeightUnit(f: WizardForm, to: 'cm' | 'ftin'): WizardForm {
  if (to === f.heightUnit) return f;
  if (to === 'ftin') {
    const cm = parseDecimal(f.heightCm);
    const v = cm === null ? null : cmToFtIn(cm);
    return { ...f, heightUnit: to, heightFt: v ? String(v.ft) : '', heightIn: v ? String(v.inch) : '' };
  }
  const cm = heightToCm(f);
  return { ...f, heightUnit: to, heightCm: cm === null ? '' : String(cm) };
}

export function switchWeightUnit(f: WizardForm, to: 'kg' | 'lb'): WizardForm {
  if (to === f.weightUnit) return f;
  const conv = (text: string) => {
    const kgOrLb = parseDecimal(text);
    if (kgOrLb === null) return '';
    if (to === 'lb') return String(kgToLb(kgOrLb));
    const kg = lbToKg(kgOrLb);
    return kg === null ? '' : String(kg);
  };
  return { ...f, weightUnit: to, weight: conv(f.weight), target: conv(f.target) };
}

/** Builds the exact object the API expects. Missing or unparsable fields are left out so the schema reports them. */
export function formToInput(f: WizardForm): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (f.sex) out.sex = f.sex;
  const age = parseDecimal(f.age);
  if (age !== null && Number.isInteger(age)) out.age = age;
  const h = heightToCm(f);
  if (h !== null) out.heightCm = h;
  const w = weightToKg(f, f.weight);
  if (w !== null) out.weightKg = w;
  const t = weightToKg(f, f.target);
  if (t !== null) out.targetWeightKg = t;
  if (f.activity) out.activity = f.activity;
  if (f.pace) out.pace = f.pace;
  out.diet = f.diet;
  out.allergens = f.allergens;
  if (f.accepted) out.acceptedDisclaimer = true;
  return out;
}

const SCHEMA_FIELDS: Record<1 | 2 | 3 | 4, (keyof typeof ProfileInput.shape)[]> = {
  1: ['sex', 'age', 'heightCm', 'weightKg', 'activity'],
  2: ['targetWeightKg', 'pace'],
  3: ['diet', 'allergens'],
  4: ['sex', 'age', 'heightCm', 'weightKg', 'targetWeightKg', 'activity', 'pace', 'diet', 'allergens', 'acceptedDisclaimer'],
};

const FIELD_OF: Record<string, keyof FieldErrors> = {
  sex: 'sex', age: 'age', heightCm: 'height', weightKg: 'weight', targetWeightKg: 'target', activity: 'activity',
  pace: 'pace', diet: 'diet', allergens: 'allergens', acceptedDisclaimer: 'accepted',
};

function message(field: keyof FieldErrors, f: WizardForm): string {
  switch (field) {
    case 'sex': return 'Choose the option that fits best. It is only used for the calorie estimate.';
    case 'age': return 'Enter your age as a whole number from 18 to 90.';
    case 'height': return f.heightUnit === 'cm' ? 'Enter a height between 120 and 230 cm.' : 'Enter a height between 3 ft 11 in and 7 ft 6 in.';
    case 'weight': return f.weightUnit === 'kg' ? 'Enter a weight between 35 and 250 kg.' : 'Enter a weight between 77 and 551 lb.';
    case 'target': return f.weightUnit === 'kg' ? 'Enter a target between 35 and 250 kg.' : 'Enter a target between 77 and 551 lb.';
    case 'activity': return 'Pick the description closest to a normal week.';
    case 'pace': return 'Pick a pace. You can change it later.';
    case 'diet': return 'Choose a diet.';
    case 'allergens': return 'Check the allergens again.';
    case 'accepted': return 'Please accept the note to continue.';
  }
}

/** Validates one wizard step against the real contracts schema, with friendly messages. */
export function validateStep(step: 1 | 2 | 3 | 4, f: WizardForm): FieldErrors {
  const keys = SCHEMA_FIELDS[step];
  const mask = Object.fromEntries(keys.map((k) => [k, true])) as Record<string, true>;
  const schema = ProfileInput.pick(mask as never);
  const input = formToInput(f);
  const subset = Object.fromEntries(Object.entries(input).filter(([k]) => keys.includes(k as never)));
  const res = schema.safeParse(subset);
  const errors: FieldErrors = {};
  if (!res.success) {
    for (const issue of res.error.issues) {
      const field = FIELD_OF[String(issue.path[0])];
      if (field && !errors[field]) errors[field] = message(field, f);
    }
  }
  if (step === 1 || step === 4) {
    // The schema only sees converted numbers, so unparsable text still needs a specific message.
    if (heightToCm(f) === null) errors.height = message('height', f);
    if (weightToKg(f, f.weight) === null) errors.weight = message('weight', f);
  }
  if (step === 2 || step === 4) {
    if (weightToKg(f, f.target) === null) errors.target = message('target', f);
  }
  return errors;
}

export const hasErrors = (e: FieldErrors) => Object.keys(e).length > 0;

/** The full payload for PUT /api/profile, or the per-field errors that stop it. */
export function buildProfilePayload(f: WizardForm): { ok: true; value: ProfileInput } | { ok: false; errors: FieldErrors } {
  const errors = validateStep(4, f);
  if (hasErrors(errors)) return { ok: false, errors };
  const res = ProfileInput.safeParse(formToInput(f));
  if (!res.success) return { ok: false, errors: { accepted: 'Something in the form needs another look.' } };
  return { ok: true, value: res.data };
}
