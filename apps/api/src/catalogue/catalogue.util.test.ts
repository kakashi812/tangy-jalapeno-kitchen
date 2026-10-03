import { describe, expect, it } from 'vitest';
import { ApiException } from '../common/api-exception.js';
import { assertAllFound, flattenRefs } from './catalogue.util.js';

const fieldErrors = (fn: () => void) => {
  try {
    fn();
  } catch (error) {
    return (error as ApiException).body.fieldErrors;
  }
  return undefined;
};

describe('assertAllFound', () => {
  const found = [
    { id: 'a', isActive: true },
    { id: 'b', isActive: false },
  ];

  it('passes when every id exists and is active', () => {
    expect(() => assertAllFound('allergenIds', ['a'], found, 'allergens')).not.toThrow();
  });

  it('reports ids that no longer exist on the field', () => {
    expect(
      fieldErrors(() => assertAllFound('allergenIds', ['a', 'zzz'], found, 'allergens')),
    ).toEqual({
      allergenIds: ['Some allergens no longer exist. Reload the page.'],
    });
  });

  it('refuses to newly add an inactive item, but keeps one that is already linked', () => {
    expect(fieldErrors(() => assertAllFound('allergenIds', ['b'], found, 'allergens'))).toEqual({
      allergenIds: ["Inactive allergens can't be added"],
    });
    expect(() =>
      assertAllFound('allergenIds', ['b'], found, 'allergens', new Set(['b'])),
    ).not.toThrow();
  });
});

describe('flattenRefs', () => {
  it('returns allergens and tags in list order', () => {
    const row = {
      allergens: [
        { allergen: { id: '2', name: 'Milk', sortOrder: 60 } },
        { allergen: { id: '1', name: 'Eggs', sortOrder: 20 } },
      ],
      dietaryTags: [{ dietaryTag: { id: '3', name: 'Vegetarian', sortOrder: 10 } }],
    };
    expect(flattenRefs(row)).toEqual({
      allergens: [
        { id: '1', name: 'Eggs' },
        { id: '2', name: 'Milk' },
      ],
      dietaryTags: [{ id: '3', name: 'Vegetarian' }],
    });
  });
});
