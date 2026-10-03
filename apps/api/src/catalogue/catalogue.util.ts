import { ApiException } from '../common/api-exception.js';

/** Allergens and dietary tags as stored in the join tables, flattened for the API. */
export type JoinedRefs = {
  allergens: { allergen: { id: string; name: string; sortOrder: number } }[];
  dietaryTags: { dietaryTag: { id: string; name: string; sortOrder: number } }[];
};

const bySortOrder = (
  a: { sortOrder: number; name: string },
  b: { sortOrder: number; name: string },
) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);

export function flattenRefs(row: JoinedRefs) {
  return {
    allergens: row.allergens
      .map((link) => link.allergen)
      .sort(bySortOrder)
      .map(({ id, name }) => ({ id, name })),
    dietaryTags: row.dietaryTags
      .map((link) => link.dietaryTag)
      .sort(bySortOrder)
      .map(({ id, name }) => ({ id, name })),
  };
}

export const REFS_INCLUDE = {
  allergens: { include: { allergen: { select: { id: true, name: true, sortOrder: true } } } },
  dietaryTags: { include: { dietaryTag: { select: { id: true, name: true, sortOrder: true } } } },
} as const;

/**
 * Checks that every id in a submitted list exists, and (for new links) is active, and reports the
 * problem on the form field. `found` is what the database returned for those ids.
 */
export function assertAllFound(
  field: string,
  ids: string[],
  found: { id: string; isActive: boolean }[],
  label: string,
  alreadyLinked: Set<string> = new Set(),
): void {
  const byId = new Map(found.map((row) => [row.id, row]));
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length > 0) {
    throw ApiException.validation({ [field]: [`Some ${label} no longer exist. Reload the page.`] });
  }
  // An inactive item may stay where it already is, but can't be newly added.
  const newlyInactive = ids.filter((id) => !byId.get(id)!.isActive && !alreadyLinked.has(id));
  if (newlyInactive.length > 0) {
    throw ApiException.validation({ [field]: [`Inactive ${label} can't be added`] });
  }
}

export function hasPrismaCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}
