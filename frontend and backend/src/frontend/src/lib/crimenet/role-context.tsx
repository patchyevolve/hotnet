/**
 * CrimeNet — demo role + language context.
 *
 * This is a frontend-only demonstration of role switching. It is explicitly
 * NOT authentication or access control: no credentials are checked and no
 * backend enforcement exists. Switching role only changes which dashboard
 * widgets are shown.
 */

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
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
  role: Role;
  setRole: (role: Role) => void;
  language: Language;
  setLanguage: (language: Language) => void;
  toggleLanguage: () => void;
}

const RoleContext = createContext<RoleContextValue | null>(null);

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>("INSPECTOR");
  const [language, setLanguage] = useState<Language>("en");

  const toggleLanguage = useCallback(() => {
    setLanguage((current) => (current === "en" ? "hi" : "en"));
  }, []);

  const value = useMemo<RoleContextValue>(
    () => ({ role, setRole, language, setLanguage, toggleLanguage }),
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
