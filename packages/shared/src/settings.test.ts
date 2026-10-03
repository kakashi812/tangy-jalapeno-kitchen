import { describe, expect, it } from 'vitest';
import {
  HolidayInputSchema,
  ReferenceItemInputSchema,
  ReferenceItemUpdateSchema,
  SettingsSchema,
  DEFAULT_SETTINGS,
} from './settings.js';

describe('reference item schemas', () => {
  it('fills defaults when creating', () => {
    expect(ReferenceItemInputSchema.parse({ name: ' Tiffin ' })).toEqual({
      name: 'Tiffin',
      isActive: true,
      sortOrder: 0,
    });
  });

  it('only contains the sent fields when updating (no defaults overwrite other values)', () => {
    expect(ReferenceItemUpdateSchema.parse({ isActive: false })).toEqual({ isActive: false });
  });
});

describe('settings schema', () => {
  it('accepts the defaults', () => {
    expect(SettingsSchema.parse(DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
  });

  it('rejects no working days, duplicate days and out-of-range values', () => {
    expect(SettingsSchema.safeParse({ ...DEFAULT_SETTINGS, kitchenWorkingDays: [] }).success).toBe(
      false,
    );
    expect(
      SettingsSchema.safeParse({ ...DEFAULT_SETTINGS, kitchenWorkingDays: [1, 1] }).success,
    ).toBe(false);
    expect(SettingsSchema.safeParse({ ...DEFAULT_SETTINGS, cutoffTimeMinutes: 1440 }).success).toBe(
      false,
    );
  });
});

describe('holiday schema', () => {
  it('requires the end on or after the start', () => {
    const base = { name: 'Closed', startDate: '2026-10-09' };
    expect(HolidayInputSchema.safeParse({ ...base, endDate: '2026-10-09' }).success).toBe(true);
    expect(HolidayInputSchema.safeParse({ ...base, endDate: '2026-10-08' }).success).toBe(false);
    expect(HolidayInputSchema.safeParse({ ...base, endDate: '2026-02-30' }).success).toBe(false);
  });
});
