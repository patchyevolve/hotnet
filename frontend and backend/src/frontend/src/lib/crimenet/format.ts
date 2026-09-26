/**
 * CrimeNet — shared formatting helpers.
 *
 * All date, number and label formatting flows through here so every screen
 * renders identifiers and timestamps identically.
 */

import type { CasePriority, CaseStatus, EntityKind, RiskLevel } from "./types";

const dateTimeFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return dateTimeFormatter.format(date);
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return dateFormatter.format(date);
}

export function formatRelative(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
}

export function formatCurrency(amount: number, currency = "INR"): string {
  const formatted = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
  return formatted;
}

export function formatCompactCurrency(
  amount: number,
  currency = "INR",
): string {
  if (amount >= 10_000_000) return `₹${(amount / 10_000_000).toFixed(2)}Cr`;
  if (amount >= 100_000) return `₹${(amount / 100_000).toFixed(2)}L`;
  if (amount >= 1_000) return `₹${(amount / 1_000).toFixed(1)}K`;
  return formatCurrency(amount, currency);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-IN").format(value);
}

export function formatPercent(value: number, digits = 0): string {
  return `${value.toFixed(digits)}%`;
}

export const riskLabels: Record<RiskLevel, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const caseStatusLabels: Record<CaseStatus, string> = {
  open: "Open",
  active: "Active",
  under_review: "Under Review",
  charge_sheet: "Charge Sheet",
  closed: "Closed",
};

export const casePriorityLabels: Record<CasePriority, string> = {
  p1: "P1 — Immediate",
  p2: "P2 — High",
  p3: "P3 — Routine",
  p4: "P4 — Low",
};

export const entityKindLabels: Record<EntityKind, string> = {
  person: "Person",
  phone: "Phone",
  account: "Account",
  vehicle: "Vehicle",
  organization: "Organization",
  location: "Location",
  amount: "Amount",
  date: "Date",
  event: "Event",
  device: "Device",
};

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function truncateMiddle(value: string, head = 6, tail = 4): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}
