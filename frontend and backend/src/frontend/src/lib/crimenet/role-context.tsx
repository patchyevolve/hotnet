/**
 * CrimeNet — signed role + language context.
 *
 * `role` is not user-selectable: it is read from the bearer token issued at
 * sign-in (`useIdentity`) and re-read whenever that token changes, so the
 * whole shell reflects the JWT's claims. The context only owns the UI
 * language; everything access-control related comes from the signed identity.
 */

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { useIdentity } from "./identity";
import type { Language, Role } from "./types";

export const roles: Role[] = [
  "INSPECTOR",
  "SUPERVISOR",
  "ADMIN",
  "AUDIT_LOGGER",
];

export const roleLabels: Record<Role, string> = {
  INSPECTOR: "Inspector",
  SUPERVISOR: "Supervisor",
  ADMIN: "Administrator",
  AUDIT_LOGGER: "Audit Logger",
};

export const roleDescriptions: Record<Role, string> = {
  INSPECTOR: "Field investigation view — assigned cases, leads and evidence.",
  SUPERVISOR: "Unit oversight view — approvals, workload and escalations.",
  ADMIN: "Platform administration view — users, storage and access events.",
  AUDIT_LOGGER: "Integrity view — audit chain, flagged events and reviews.",
};

interface RoleContextValue {
  /** Effective role, decoded from the stored token (INSPECTOR if absent). */
  role: Role;
  language: Language;
  setLanguage: (language: Language) => void;
  toggleLanguage: () => void;
}

const RoleContext = createContext<RoleContextValue | null>(null);

export function RoleProvider({ children }: { children: ReactNode }) {
  const identity = useIdentity();
  const [language, setLanguage] = useState<Language>("en");
  const role: Role = identity?.role ?? "INSPECTOR";

  const toggleLanguage = useCallback(() => {
    setLanguage((current) => (current === "en" ? "hi" : "en"));
  }, []);

  const value = useMemo<RoleContextValue>(
    () => ({ role, language, setLanguage, toggleLanguage }),
    [role, language, toggleLanguage],
  );

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole(): RoleContextValue {
  const context = useContext(RoleContext);
  if (!context) {
    throw new Error("useRole must be used within a RoleProvider");
  }
  return context;
}
