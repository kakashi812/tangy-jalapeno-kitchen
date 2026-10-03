import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv.js';
import { checkEmployeeRow, type ImportContext } from './employees.js';

describe('parseCsv', () => {
  it('reads plain, quoted and escaped fields', () => {
    expect(parseCsv('a,b,c\n1,"two, with comma","say ""hi"""\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', 'two, with comma', 'say "hi"'],
    ]);
  });

  it('handles CRLF, a byte-order mark, empty fields and line breaks inside quotes', () => {
    expect(parseCsv('﻿name,phone\r\n"Line\nbreak",\r\n\r\n')).toEqual([
      ['name', 'phone'],
      ['Line\nbreak', ''],
    ]);
  });

  it('reads a last line without a trailing newline', () => {
    expect(parseCsv('a\nb')).toEqual([['a'], ['b']]);
  });
});

const CONTEXT: ImportContext = {
  companyId: '00000000-0000-4000-8000-000000000001',
  companyDomains: ['acme.com'],
  allergenIds: new Map([['milk', '00000000-0000-4000-8000-0000000000a1']]),
  dietaryTagIds: new Map([['vegan', '00000000-0000-4000-8000-0000000000b1']]),
  existingEmails: new Set(['taken@acme.com']),
};

const row = (overrides: Record<string, string> = {}) => ({
  name: 'Priya Sharma',
  email: 'Priya@Acme.com',
  phone: '',
  can_choose_address: 'yes',
  can_change_delivery_time: '',
  can_change_packaging: 'no',
  allergies: 'Milk',
  dietary_preferences: ' vegan ',
  ...overrides,
});

describe('checkEmployeeRow', () => {
  it('accepts a good row, normalising email, flags and list names', () => {
    const result = checkEmployeeRow(row(), CONTEXT, new Set());
    expect(result).toMatchObject({
      ok: true,
      input: {
        email: 'priya@acme.com',
        canChooseAddress: true,
        canChangeDeliveryTime: false,
        allergenIds: ['00000000-0000-4000-8000-0000000000a1'],
        dietaryTagIds: ['00000000-0000-4000-8000-0000000000b1'],
      },
    });
  });

  it('collects every problem in the row, not just the first', () => {
    const result = checkEmployeeRow(
      row({ name: '', can_choose_address: 'maybe', allergies: 'Milk;Shellfish' }),
      CONTEXT,
      new Set(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.messages).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/can_choose_address must be yes or no/),
          expect.stringMatching(/Unknown allergen "Shellfish"/),
          expect.stringMatching(/name: Enter a name/),
        ]),
      );
    }
  });

  it('refuses an email on another domain, an existing email and a duplicate within the file', () => {
    const wrongDomain = checkEmployeeRow(row({ email: 'priya@gmail.com' }), CONTEXT, new Set());
    expect(wrongDomain.ok || wrongDomain.messages).toEqual([
      expect.stringMatching(/must be on @acme.com/),
    ]);
    const existing = checkEmployeeRow(row({ email: 'taken@acme.com' }), CONTEXT, new Set());
    expect(existing.ok || existing.messages).toEqual([
      'an employee with this email already exists',
    ]);
    const repeated = checkEmployeeRow(row(), CONTEXT, new Set(['priya@acme.com']));
    expect(repeated.ok || repeated.messages).toEqual(['this email appears earlier in the file']);
  });
});
