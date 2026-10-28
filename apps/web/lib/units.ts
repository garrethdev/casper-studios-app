/** Unit helpers for the onboarding form. Pure, rounding is explicit, and bad input returns null instead of NaN. */
export const CM_PER_INCH = 2.54;
export const LB_PER_KG = 2.2046226218;

export const round1 = (n: number) => Math.round(n * 10) / 10;

/** Accepts "72", "72.5" and "72,5". Rejects empty text, units, hex, exponents and anything not finite. */
export function parseDecimal(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function kgToLb(kg: number): number {
  return round1(kg * LB_PER_KG);
}

export function lbToKg(lb: number): number | null {
  if (!Number.isFinite(lb) || lb <= 0) return null;
  return round1(lb / LB_PER_KG);
}

/** Whole inches, because nobody measures themselves to a tenth of an inch. */
export function cmToFtIn(cm: number): { ft: number; inch: number } | null {
  if (!Number.isFinite(cm) || cm <= 0) return null;
  const total = Math.round(cm / CM_PER_INCH);
  return { ft: Math.floor(total / 12), inch: total % 12 };
}

export function ftInToCm(ft: number, inch: number): number | null {
  if (!Number.isFinite(ft) || !Number.isFinite(inch)) return null;
  if (ft < 0 || ft > 9 || inch < 0 || inch >= 12) return null;
  const total = ft * 12 + inch;
  if (total <= 0) return null;
  return round1(total * CM_PER_INCH);
}

export const formatFtIn = (cm: number) => {
  const v = cmToFtIn(cm);
  return v ? `${v.ft} ft ${v.inch} in` : '';
};

/** Weekly pace shown in both unit systems, e.g. "0.5 kg (1.1 lb)". */
export function formatPace(kgPerWeek: number): string {
  return `${kgPerWeek} kg (${kgToLb(kgPerWeek)} lb)`;
}
