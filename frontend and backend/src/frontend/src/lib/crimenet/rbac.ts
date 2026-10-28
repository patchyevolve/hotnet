/**
 * CrimeNet — client-side RBAC rules.
 *
 * The server is the authority (`api/rbac.py`): every guarded route re-checks
 * the bearer token. These helpers only decide what the UI *shows* — which
 * sections a role may open, which controls are rendered — so an investigator
 * is never offered an action the API would answer with a 403.
 *
 * Levels mirror the backend's `CaseAccessLevel` ladder:
 * `NONE < READ < WRITE < ADMIN`.
 */

import { type NavItem, navItems } from "./navigation";
import type { Role, SessionIdentity } from "./types";

/** Access level on a case, mirroring the backend `CaseAccessLevel` ladder. */
export type AccessLevel = "NONE" | "READ" | "WRITE" | "ADMIN";

/** Ordered so a higher grant satisfies a request for a lower one. */
export const LEVEL_RANK: Record<AccessLevel, number> = {
  NONE: 0,
  READ: 1,
  WRITE: 2,
  ADMIN: 3,
};

/** Operational ladder (AUDIT_LOGGER sits outside it, by design). */
export const ROLE_RANK: Record<Role, number> = {
  INSPECTOR: 10,
  SUPERVISOR: 20,
  ADMIN: 30,
  AUDIT_LOGGER: 0,
};

/** Roles that may open the audit trail — INSPECTOR is deliberately absent. */
export const AUDIT_ROLES: readonly Role[] = [
  "ADMIN",
  "SUPERVISOR",
  "AUDIT_LOGGER",
];

/** Roles that may register a case (matches `POST /api/cases`). */
export const CASE_AUTHOR_ROLES: readonly Role[] = ["ADMIN", "SUPERVISOR"];

/**
 * Roles that may confirm or reject a face match
 * (matches `POST /api/faces/decision` — the audit logger may not decide).
 */
export const FACE_DECISION_ROLES: readonly Role[] = [
  "ADMIN",
  "SUPERVISOR",
  "INSPECTOR",
];

/**
 * Station baseline: the level each role holds on cases registered to its own
 * station (ADMIN is global). Mirrors `CaseAccessGuard._STATION_BASELINE`.
 */
export const STATION_BASELINE: Record<Role, AccessLevel> = {
  ADMIN: "ADMIN",
  SUPERVISOR: "ADMIN",
  INSPECTOR: "WRITE",
  AUDIT_LOGGER: "READ",
};

export function levelAtLeast(
  level: AccessLevel,
  required: AccessLevel,
): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[required];
}

export function canCreateCase(role: Role): boolean {
  return CASE_AUTHOR_ROLES.includes(role);
}

export function canViewAudit(role: Role): boolean {
  return AUDIT_ROLES.includes(role);
}

export function canDecideFace(role: Role): boolean {
  return FACE_DECISION_ROLES.includes(role);
}

/** WRITE or ADMIN — evidence upload, pipeline run, face decisions. */
export function canMutate(level: AccessLevel): boolean {
  return levelAtLeast(level, "WRITE");
}

/**
 * Effective level derived from the signed identity alone — the fallback used
 * when `GET /api/auth/effective-level` cannot be reached. The endpoint is
 * authoritative (it also sees `CaseAccess` grants); this mirrors its station
 * baseline plus the creator grant so the UI still fails closed cross-station.
 */
export function localEffectiveLevel(
  identity: SessionIdentity | null,
  options: { station?: string; createdBy?: string } = {},
): AccessLevel {
  if (!identity) return "NONE";
  if (identity.role === "ADMIN") return "ADMIN";
  const baseline = STATION_BASELINE[identity.role];
  if (options.createdBy && identity.userId === options.createdBy)
    return "ADMIN";
  if (!options.station) return baseline;
  return identity.jurisdictionId === options.station ? baseline : "NONE";
}

/**
 * Sections a role is offered in the sidebar and command palette.
 *
 * * ADMIN / SUPERVISOR — the full workstation.
 * * INSPECTOR — everything except audit oversight (the page redirects to 403).
 * * AUDIT_LOGGER — read-only oversight: Command Center + Security & Audit.
 *   The case registry stays reachable read-only, but it is not offered as a
 *   section to the auditor.
 */
export function navItemsForRole(role: Role): NavItem[] {
  if (role === "AUDIT_LOGGER") {
    return navItems.filter(
      (item) => item.id === "command-center" || item.id === "security-audit",
    );
  }
  if (role === "INSPECTOR") {
    return navItems.filter((item) => item.id !== "security-audit");
  }
  return navItems;
}
