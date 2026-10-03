import { describe, expect, it } from 'vitest';
import { DeliveryTimeSchema, EmailDomainSchema, emailDomain } from './companies.js';

describe('EmailDomainSchema', () => {
  it('normalises case, spaces and a leading @', () => {
    expect(EmailDomainSchema.parse('  @Northwind.Example ')).toBe('northwind.example');
    expect(EmailDomainSchema.parse('mail.acme.co.in')).toBe('mail.acme.co.in');
  });

  it('refuses public email providers', () => {
    const result = EmailDomainSchema.safeParse('Gmail.com');
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/Public email domains/);
  });

  it('refuses malformed domains', () => {
    for (const bad of ['acme', 'acme..com', '-acme.com', 'acme.c', 'ac me.com', 'acme.com/x']) {
      expect(EmailDomainSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe('emailDomain', () => {
  it('takes the part after @, lowercased', () => {
    expect(emailDomain('Priya.S@Northwind.Example')).toBe('northwind.example');
  });
});

describe('DeliveryTimeSchema', () => {
  it('accepts quarter hours only', () => {
    expect(DeliveryTimeSchema.safeParse(12 * 60 + 30).success).toBe(true);
    expect(DeliveryTimeSchema.safeParse(12 * 60 + 10).success).toBe(false);
  });
});
