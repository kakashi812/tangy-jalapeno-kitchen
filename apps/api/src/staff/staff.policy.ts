import { ErrorCode } from '@fernleaf/shared';

/**
 * The rules that keep the panel from locking everyone out. Pure functions (no database), so they
 * are easy to test; the service gathers the facts and calls them inside a transaction.
 */

export type StaffChangeFacts = {
  actorId: string;
  target: { id: string; isActive: boolean; roleIsSystem: boolean };
  change: { isActive?: boolean; roleChanges: boolean; newRoleIsSystem?: boolean };
  /** Active staff on a system (Admin) role, not counting the target. */
  otherActiveAdmins: number;
};

export type PolicyViolation = { code: string; message: string };

export function checkStaffChange(facts: StaffChangeFacts): PolicyViolation | null {
  const { actorId, target, change, otherActiveAdmins } = facts;

  if (target.id === actorId) {
    if (change.isActive === false) {
      return { code: ErrorCode.SelfLockout, message: "You can't deactivate your own account" };
    }
    if (change.roleChanges) {
      return { code: ErrorCode.SelfLockout, message: "You can't change your own role" };
    }
  }

  const isAdminNow = target.isActive && target.roleIsSystem;
  const staysAdmin =
    (change.isActive ?? target.isActive) &&
    (change.roleChanges ? change.newRoleIsSystem === true : target.roleIsSystem);
  if (isAdminNow && !staysAdmin && otherActiveAdmins === 0) {
    return {
      code: ErrorCode.LastAdmin,
      message: 'This is the last active admin. Make someone else an admin first.',
    };
  }
  return null;
}
