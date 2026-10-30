// A user's state and what an admin may do with it. Shared by the server checks
// and the Users & Roles screen.

export type UserState = "active" | "pending" | "rejected" | "deactivated";
export type UserAction = "approve" | "reject" | "activate" | "deactivate" | "edit";

export function userState(u: { active: boolean; role: string | null; rejectedAt: string | null }): UserState {
  if (u.rejectedAt) return "rejected";
  if (u.active) return "active";
  return u.role ? "deactivated" : "pending";
}

// Rejecting an already-rejected user is allowed and changes nothing.
const ALLOWED: Record<UserAction, UserState[]> = {
  approve: ["pending", "rejected"],
  reject: ["pending", "rejected"],
  activate: ["deactivated"],
  deactivate: ["active"],
  edit: ["active", "deactivated"],
};

export function actionAllowed(state: UserState, action: UserAction): boolean {
  return ALLOWED[action].includes(state);
}
