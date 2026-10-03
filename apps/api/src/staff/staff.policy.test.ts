import { describe, expect, it } from 'vitest';
import { checkStaffChange, type StaffChangeFacts } from './staff.policy.js';

const admin = { id: 'a1', isActive: true, roleIsSystem: true };
const cook = { id: 'k1', isActive: true, roleIsSystem: false };

function facts(overrides: Partial<StaffChangeFacts>): StaffChangeFacts {
  return {
    actorId: 'someone-else',
    target: cook,
    change: { roleChanges: false },
    otherActiveAdmins: 1,
    ...overrides,
  };
}

describe('checkStaffChange', () => {
  it('allows ordinary edits', () => {
    expect(checkStaffChange(facts({ change: { isActive: false, roleChanges: false } }))).toBeNull();
    expect(
      checkStaffChange(facts({ change: { roleChanges: true, newRoleIsSystem: true } })),
    ).toBeNull();
  });

  it('stops you deactivating yourself or changing your own role', () => {
    const self = { actorId: admin.id, target: admin };
    expect(
      checkStaffChange(facts({ ...self, change: { isActive: false, roleChanges: false } }))?.code,
    ).toBe('SELF_LOCKOUT');
    expect(
      checkStaffChange(facts({ ...self, change: { roleChanges: true, newRoleIsSystem: false } }))
        ?.code,
    ).toBe('SELF_LOCKOUT');
  });

  it('lets you edit your own name', () => {
    expect(checkStaffChange(facts({ actorId: admin.id, target: admin }))).toBeNull();
  });

  it('refuses to deactivate or demote the last active admin', () => {
    const last = { target: admin, otherActiveAdmins: 0 };
    expect(
      checkStaffChange(facts({ ...last, change: { isActive: false, roleChanges: false } }))?.code,
    ).toBe('LAST_ADMIN');
    expect(
      checkStaffChange(facts({ ...last, change: { roleChanges: true, newRoleIsSystem: false } }))
        ?.code,
    ).toBe('LAST_ADMIN');
  });

  it('allows removing an admin when another active admin remains', () => {
    expect(
      checkStaffChange(facts({ target: admin, change: { isActive: false, roleChanges: false } })),
    ).toBeNull();
  });

  it('does not count an already inactive admin as the last one', () => {
    const inactiveAdmin = { ...admin, isActive: false };
    expect(
      checkStaffChange(
        facts({
          target: inactiveAdmin,
          otherActiveAdmins: 0,
          change: { roleChanges: true, newRoleIsSystem: false },
        }),
      ),
    ).toBeNull();
  });
});
