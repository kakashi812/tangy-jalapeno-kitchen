import type { ReferenceKind } from '@fernleaf/shared';

/** Starting lists (decision 57). Admins edit them in the panel; seeding never overwrites edits. */
export const REFERENCE_SEED: Record<ReferenceKind, string[]> = {
  // The 14 allergens commonly required on food labels.
  allergens: [
    'Cereals containing gluten',
    'Crustaceans',
    'Eggs',
    'Fish',
    'Peanuts',
    'Soy',
    'Milk',
    'Tree nuts',
    'Celery',
    'Mustard',
    'Sesame',
    'Sulphites',
    'Lupin',
    'Molluscs',
  ],
  'dietary-tags': ['Vegan', 'Vegetarian', 'Jain', 'Gluten-free', 'Dairy-free', 'Halal'],
  stations: ['Tandoor', 'Curry', 'Grill', 'Cold & Salad', 'Bakery'],
  'portion-sizes': ['Regular', 'Large'],
  'packaging-types': ['Standard box', 'Eco box', 'Individually labelled'],
};

export const HOLIDAY_SEED = [
  { name: 'Diwali break', startDate: '2026-11-09', endDate: '2026-11-10' },
  { name: 'Christmas Day', startDate: '2026-12-25', endDate: '2026-12-25' },
  { name: "New Year's Day", startDate: '2027-01-01', endDate: '2027-01-01' },
];
