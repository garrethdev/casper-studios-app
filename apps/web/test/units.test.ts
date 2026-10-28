import { describe, expect, it } from 'vitest';
import { cmToFtIn, formatFtIn, formatPace, ftInToCm, kgToLb, lbToKg, parseDecimal } from '../lib/units';

describe('unit conversions', () => {
  it('converts feet and inches to centimeters with one decimal', () => {
    expect(ftInToCm(5, 10)).toBe(177.8);
    expect(ftInToCm(6, 0)).toBe(182.9);
    expect(ftInToCm(5, 0)).toBe(152.4);
    expect(ftInToCm(0, 48)).toBeNull(); // inches must be under 12
  });

  it('converts centimeters to whole feet and inches', () => {
    expect(cmToFtIn(177.8)).toEqual({ ft: 5, inch: 10 });
    expect(cmToFtIn(152.4)).toEqual({ ft: 5, inch: 0 });
    expect(cmToFtIn(182.88)).toEqual({ ft: 6, inch: 0 });
    expect(formatFtIn(165)).toBe('5 ft 5 in');
  });

  it('rolls up correctly instead of showing 12 inches', () => {
    const v = cmToFtIn(182)!; // 71.65 in rounds to 72
    expect(v).toEqual({ ft: 6, inch: 0 });
  });

  it('round trips within half an inch', () => {
    for (let cm = 120; cm <= 230; cm += 7) {
      const { ft, inch } = cmToFtIn(cm)!;
      expect(Math.abs(ftInToCm(ft, inch)! - cm)).toBeLessThanOrEqual(1.3);
    }
  });

  it('converts pounds and kilograms with rounding to one decimal', () => {
    expect(kgToLb(82)).toBe(180.8);
    expect(kgToLb(0.5)).toBe(1.1);
    expect(lbToKg(180)).toBe(81.6);
    expect(lbToKg(220.5)).toBe(100);
    expect(formatPace(0.25)).toBe('0.25 kg (0.6 lb)');
    expect(formatPace(0.75)).toBe('0.75 kg (1.7 lb)');
  });

  it('round trips kg -> lb -> kg within rounding', () => {
    for (const kg of [35, 52.3, 70, 99.9, 150, 250]) expect(Math.abs(lbToKg(kgToLb(kg))! - kg)).toBeLessThanOrEqual(0.1);
  });

  it('range checks: rejects nonsense instead of returning NaN', () => {
    expect(ftInToCm(-1, 5)).toBeNull();
    expect(ftInToCm(5, -1)).toBeNull();
    expect(ftInToCm(5, 12)).toBeNull();
    expect(ftInToCm(10, 0)).toBeNull();
    expect(ftInToCm(0, 0)).toBeNull();
    expect(ftInToCm(Number.NaN, 1)).toBeNull();
    expect(lbToKg(0)).toBeNull();
    expect(lbToKg(-5)).toBeNull();
    expect(lbToKg(Number.POSITIVE_INFINITY)).toBeNull();
    expect(cmToFtIn(0)).toBeNull();
    expect(cmToFtIn(Number.NaN)).toBeNull();
  });

  it('parseDecimal accepts plain numbers with . or , and rejects the rest', () => {
    expect(parseDecimal('72')).toBe(72);
    expect(parseDecimal(' 72.5 ')).toBe(72.5);
    expect(parseDecimal('72,5')).toBe(72.5);
    for (const bad of ['', ' ', 'abc', '1e3', '0x10', '-5', '5kg', '1.234', '12345', 'NaN', 'Infinity', '1,2,3']) expect(parseDecimal(bad)).toBeNull();
  });
});
