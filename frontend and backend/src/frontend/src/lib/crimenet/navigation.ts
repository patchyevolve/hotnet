/**
 * CrimeNet — navigation model.
 *
 * The sidebar, command palette and route table all read from this single list
 * so a section can never drift out of sync between them.
 */

import {
  Activity,
  BadgeCheck,
  Banknote,
  BarChart3,
  BrainCircuit,
  FileUp,
  FolderLock,
  LayoutDashboard,
  Map as MapIcon,
  Network,
  ScanFace,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  id: string;
  label: string;
  labelHi: string;
  path: string;
  icon: LucideIcon;
  description: string;
}

export const navItems: NavItem[] = [
  {
    id: "command-center",
    label: "Command Center",
    labelHi: "कमांड सेंटर",
    path: "/",
    icon: LayoutDashboard,
    description: "Operational overview and priority alerts",
  },
  {
    id: "cases",
    label: "Cases",
    labelHi: "मामले",
    path: "/cases",
    icon: FolderLock,
    description: "Case registry and workbench",
  },
  {
    id: "intake",
    label: "Case Intake",
    labelHi: "केस इनटेक",
    path: "/intake",
    icon: FileUp,
    description: "Register an FIR, upload evidence and run the pipeline",
  },
  {
    id: "analytics",
    label: "Graph Analytics",
    labelHi: "ग्राफ एनालिटिक्स",
    path: "/analytics",
    icon: BarChart3,
    description: "Centrality, communities, components and multi-hop paths",
  },
  {
    id: "network",
    label: "Network Intelligence",
    labelHi: "नेटवर्क इंटेलिजेंस",
    path: "/network",
    icon: Network,
    description: "Link analysis across entities",
  },
  {
    id: "cdr",
    label: "CDR Analysis",
    labelHi: "सीडीआर विश्लेषण",
    path: "/cdr",
    icon: Activity,
    description: "Call detail record exploration",
  },
  {
    id: "money-trail",
    label: "Money Trail",
    labelHi: "धन मार्ग",
    path: "/money-trail",
    icon: Banknote,
    description: "Financial flow and layering analysis",
  },
  {
    id: "command-map",
    label: "Command Map",
    labelHi: "कमांड मैप",
    path: "/map",
    icon: MapIcon,
    description: "Geospatial incident and entity view",
  },
  {
    id: "entity-intelligence",
    label: "Entity Intelligence",
    labelHi: "इकाई इंटेलिजेंस",
    path: "/entities",
    icon: Users,
    description: "Unified entity profiles",
  },
  {
    id: "face-intelligence",
    label: "Face Intelligence",
    labelHi: "फेस इंटेलिजेंस",
    path: "/face",
    icon: ScanFace,
    description: "Camera match review queue",
  },
  {
    id: "ai-investigator",
    label: "AI Investigator",
    labelHi: "एआई अन्वेषक",
    path: "/ai-investigator",
    icon: BrainCircuit,
    description: "Analyst assistant and insights",
  },
  {
    id: "evidence-vault",
    label: "Evidence Vault",
    labelHi: "साक्ष्य तिजोरी",
    path: "/evidence",
    icon: BadgeCheck,
    description: "Evidence integrity and custody",
  },
  {
    id: "security-audit",
    label: "Security & Audit",
    labelHi: "सुरक्षा और ऑडिट",
    path: "/security",
    icon: ShieldCheck,
    description: "Access log and audit chain",
  },
];

export function findNavItem(pathname: string): NavItem | undefined {
  if (pathname === "/") return navItems[0];
  return navItems.find(
    (item) => item.path !== "/" && pathname.startsWith(item.path),
  );
}
