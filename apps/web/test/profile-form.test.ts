import { describe, expect, it } from 'vitest';
import { ProfileInput } from '@leanplate/contracts';
import { buildProfilePayload, emptyForm, formFromProfile, formToInput, hasErrors, switchHeightUnit, switchWeightUnit, validateStep, type WizardForm } from '../lib/profile-form';

const good = (): WizardForm => ({
  ...emptyForm(), sex: 'female', age: '34', heightCm: '165', weight: '82', target: '68', activity: 'light', pace: 'steady', accepted: true,
});

describe('onboarding validation per step', () => {
  it('step 1 reports every missing or bad field with friendly text', () => {
    const e = validateStep(1, emptyForm());
    expect(Object.keys(e).sort()).toEqual(['activity', 'age', 'height', 'sex', 'weight']);
    expect(e.age).toMatch(/18 to 90/);
    expect(validateStep(1, { ...good(), age: '17' }).age).toBeDefined();
    expect(validateStep(1, { ...good(), age: '34.5' }).age).toBeDefined();
    expect(validateStep(1, { ...good(), heightCm: '300' }).height).toBeDefined();
    expect(validateStep(1, { ...good(), weight: '20' }).weight).toBeDefined();
    expect(hasErrors(validateStep(1, good()))).toBe(false);
  });

  it('step 1 works in ft/in and lb, with unit-specific messages', () => {
    const f = switchWeightUnit(switchHeightUnit(good(), 'ftin'), 'lb');
    expect(f.heightFt).toBe('5');
    expect(f.heightIn).toBe('5');
    expect(f.weight).toBe('180.8');
    expect(hasErrors(validateStep(1, f))).toBe(false);
    expect(validateStep(1, { ...f, heightFt: '9', heightIn: '11' }).height).toMatch(/ft/);
    expect(validateStep(1, { ...f, weight: '30' }).weight).toMatch(/lb/);
    expect(validateStep(1, { ...f, heightIn: '14' }).height).toBeDefined();
  });

  it('switching units converts the shown values and survives a round trip', () => {
    const lb = switchWeightUnit(good(), 'lb');
    expect(lb.target).toBe('149.9');
    const back = switchWeightUnit(lb, 'kg');
    expect(Number(back.weight)).toBeCloseTo(82, 0);
    const ftin = switchHeightUnit(good(), 'ftin');
    const cm = switchHeightUnit(ftin, 'cm');
    expect(Math.abs(Number(cm.heightCm) - 165)).toBeLessThan(1.3);
    expect(switchWeightUnit({ ...good(), weight: 'abc' }, 'lb').weight).toBe('');
  });

  it('step 2 needs a target in range and a pace', () => {
    expect(Object.keys(validateStep(2, emptyForm())).sort()).toEqual(['pace', 'target']);
    expect(hasErrors(validateStep(2, good()))).toBe(false);
    expect(validateStep(2, { ...good(), target: '10' }).target).toBeDefined();
  });

  it('step 3 always passes with defaults and rejects a duplicate-free but invalid diet only via the schema', () => {
    expect(hasErrors(validateStep(3, emptyForm()))).toBe(false);
    expect(hasErrors(validateStep(3, { ...good(), allergens: ['peanut', 'dairy'] }))).toBe(false);
  });

  it('step 4 refuses to build a payload until the note is accepted', () => {
    const r = buildProfilePayload({ ...good(), accepted: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.accepted).toMatch(/accept/i);
    const ok = buildProfilePayload(good());
    expect(ok.ok).toBe(true);
  });

  it('the built payload passes the real contracts schema and has no extra fields', () => {
    const r = buildProfilePayload({ ...good(), diet: 'vegan', allergens: ['soy'] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(ProfileInput.safeParse(r.value).success).toBe(true);
      expect(Object.keys(r.value).sort()).toEqual(['acceptedDisclaimer', 'activity', 'age', 'allergens', 'diet', 'heightCm', 'pace', 'sex', 'targetWeightKg', 'weightKg']);
      expect(r.value.weightKg).toBe(82);
      expect(r.value.acceptedDisclaimer).toBe(true);
    }
  });

  it('formToInput never invents values for blank fields', () => {
    const input = formToInput(emptyForm());
    expect(input).not.toHaveProperty('age');
    expect(input).not.toHaveProperty('acceptedDisclaimer');
  });

  it('settings prefill needs the note accepted again', () => {
    const f = formFromProfile({ sex: 'male', age: 40, heightCm: 180, weightKg: 90, targetWeightKg: 80, activity: 'moderate', pace: 'gentle', diet: 'none', allergens: [], updatedAt: 'x' });
    expect(f.accepted).toBe(false);
    expect(f.heightFt).toBe('5');
    expect(buildProfilePayload(f).ok).toBe(false);
    expect(buildProfilePayload({ ...f, accepted: true }).ok).toBe(true);
  });
});
