/**
 * Money is always an integer number of US cents. Never store or add dollars as floats.
 * $2.11 is 211.
 */
export type Cents = number;

export function isCents(value: number): boolean {
  return Number.isSafeInteger(value);
}

export function assertCents(value: number): Cents {
  if (!isCents(value)) {
    throw new RangeError(`Expected an integer number of cents, got ${value}`);
  }
  return value;
}

/** Parses a dollar string such as "2.11", "2.1" or "2" into cents without going through a float. */
export function parseDollars(input: string): Cents {
  const match = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(input.trim());
  if (!match) {
    throw new RangeError(`Not a dollar amount: "${input}"`);
  }
  const [, sign, whole = '0', fraction = ''] = match;
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return sign ? -cents : cents;
}

/** Formats cents as "$2.11". */
export function formatCents(cents: Cents): string {
  assertCents(cents);
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString('en-US');
  const rest = String(abs % 100).padStart(2, '0');
  return `${sign}$${dollars}.${rest}`;
}

/**
 * Rounds up to the next multiple of 5 cents: 211 → 215. A value already on a multiple of 5 is unchanged.
 * Used for derived tier prices (brief 4.3.6).
 */
export function roundUpToNext5Cents(cents: Cents): Cents {
  assertCents(cents);
  return Math.ceil(cents / 5) * 5;
}

export function sumCents(values: readonly Cents[]): Cents {
  return values.reduce((total, value) => total + assertCents(value), 0);
}

export function multiplyCents(cents: Cents, quantity: number): Cents {
  assertCents(cents);
  if (!Number.isSafeInteger(quantity)) {
    throw new RangeError(`Quantity must be an integer, got ${quantity}`);
  }
  return cents * quantity;
}
