import { describe, expect, it } from 'vitest';
import {
  formatCents,
  multiplyCents,
  parseDollars,
  roundUpToNext5Cents,
  sumCents,
} from './money.js';

describe('roundUpToNext5Cents', () => {
  it('rounds up to the next multiple of 5 (brief example $2.11 → $2.15)', () => {
    expect(roundUpToNext5Cents(211)).toBe(215);
    expect(roundUpToNext5Cents(214)).toBe(215);
    expect(roundUpToNext5Cents(216)).toBe(220);
  });

  it('leaves a value already on a multiple of 5 unchanged', () => {
    expect(roundUpToNext5Cents(215)).toBe(215);
    expect(roundUpToNext5Cents(0)).toBe(0);
  });

  it('rejects fractional cents', () => {
    expect(() => roundUpToNext5Cents(211.4)).toThrow(RangeError);
  });
});

describe('parseDollars', () => {
  it('parses without float error', () => {
    expect(parseDollars('2.11')).toBe(211);
    expect(parseDollars('2.1')).toBe(210);
    expect(parseDollars('2')).toBe(200);
    expect(parseDollars('0.29')).toBe(29); // 0.29 * 100 is 28.999… as a float
    expect(parseDollars('-1.05')).toBe(-105);
  });

  it('rejects malformed input', () => {
    expect(() => parseDollars('2.111')).toThrow(RangeError);
    expect(() => parseDollars('abc')).toThrow(RangeError);
    expect(() => parseDollars('')).toThrow(RangeError);
  });
});

describe('formatCents', () => {
  it('formats dollars with thousands separators', () => {
    expect(formatCents(211)).toBe('$2.11');
    expect(formatCents(5)).toBe('$0.05');
    expect(formatCents(123456789)).toBe('$1,234,567.89');
    expect(formatCents(-105)).toBe('-$1.05');
  });
});

describe('sumCents / multiplyCents', () => {
  it('adds exactly where floats would drift', () => {
    expect(sumCents([10, 20])).toBe(30); // 0.1 + 0.2 !== 0.3 in floats
    expect(sumCents([])).toBe(0);
  });

  it('multiplies by integer quantities only', () => {
    expect(multiplyCents(215, 6)).toBe(1290);
    expect(() => multiplyCents(215, 1.5)).toThrow(RangeError);
  });
});
