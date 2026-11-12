// Pure access rules (no database) — shared by the API and tested directly.

export type Level = "owner" | "edit" | "view" | "none";
export type Need = "edit" | "view";

export interface Viewer { id: string; role: string }
export interface CompanyFacts { ownerId: string | null; sharedLevel?: string | null; demo?: boolean }

export const isAdmin = (u: Viewer | null | undefined) => u?.role === "admin";

/** What a viewer may do with a company. The demo company is readable by everyone and editable by nobody. */
export function levelFor(user: Viewer | null, c: CompanyFacts): Level {
  if (c.demo) return "view";
  if (!user) return "none";
  if (isAdmin(user)) return "owner";
  if (c.ownerId && c.ownerId === user.id) return "owner";
  if (c.sharedLevel === "edit") return "edit";
  if (c.sharedLevel === "view") return "view";
  return "none";
}

export function allows(level: Level, need: Need): boolean {
  if (level === "none") return false;
  if (need === "view") return true;
  return level === "owner" || level === "edit";
}

/** Owners and the administrator manage sharing and may delete the company. */
export const canManage = (level: Level) => level === "owner";
