/**
 * CrimeNet — signed identity.
 *
 * The role and station shown in the UI come from the bearer token issued by
 * `POST /api/auth/login`, never from a picker: `useIdentity` decodes the
 * stored token (base64url payload → JSON) and exposes the claims so every
 * screen can read who is signed in.
 *
 * Both token shapes used by the API are understood:
 *
 * * `header.payload.signature` (standard JWT) — payload is segment 2;
 * * `payload.signature` (the server's compact signed token) — payload is
 *   segment 1.
 *
 * A token that cannot be decoded yields `null` instead of a guessed role, so
 * guards fail closed.
 */

import { useSyncExternalStore } from "react";
import { getToken, subscribeToAuth } from "./api-client";
import type { Role, SessionIdentity } from "./types";

export const ROLES: readonly Role[] = [
  "INSPECTOR",
  "SUPERVISOR",
  "ADMIN",
  "AUDIT_LOGGER",
];

/** Claims carried inside the signed payload (snake_case from the API). */
interface TokenClaims {
  user_id?: string;
  userId?: string;
  display_name?: string;
  displayName?: string;
  role?: string;
  jurisdiction_id?: string;
  jurisdictionId?: string;
  provider?: string;
  iat?: number;
  exp?: number;
}

function decodeBase64Url(segment: string): string {
  const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function isRole(value: unknown): value is Role {
  return (
    typeof value === "string" && (ROLES as readonly string[]).includes(value)
  );
}

/** Decode the JWT payload of `token` into the signed identity. */
export function decodeToken(token: string | null): SessionIdentity | null {
  if (!token) return null;
  const segments = token.split(".");
  if (segments.length < 2) return null;
  const payload = segments.length >= 3 ? segments[1] : segments[0];
  let claims: TokenClaims;
  try {
    claims = JSON.parse(decodeBase64Url(payload)) as TokenClaims;
  } catch {
    return null;
  }
  if (!isRole(claims.role)) return null;
  return {
    userId: claims.userId ?? claims.user_id ?? "",
    displayName: claims.displayName ?? claims.display_name ?? "",
    role: claims.role,
    jurisdictionId: claims.jurisdictionId ?? claims.jurisdiction_id ?? "",
    provider: claims.provider ?? "credential",
  };
}

// The decode is memoised on the raw token so `useSyncExternalStore` gets a
// stable snapshot; a new token (sign-in/out) is the only invalidation.
let cachedToken: string | null | undefined;
let cachedIdentity: SessionIdentity | null;

export function getIdentity(): SessionIdentity | null {
  const token = getToken();
  if (token !== cachedToken) {
    cachedToken = token;
    cachedIdentity = decodeToken(token);
  }
  return cachedIdentity;
}

/**
 * The signed-in identity, re-read whenever the stored token changes.
 * Components across the UI (shell, nav, pages) read role and station from
 * this object.
 */
export function useIdentity(): SessionIdentity | null {
  return useSyncExternalStore(subscribeToAuth, getIdentity, () => null);
}
