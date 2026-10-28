import type { Role } from "@/lib/crimenet/types";

/**
 * Test-side bearer tokens.
 *
 * The app now derives role and station from a signed token, so every test
 * that renders an authenticated shell needs a token that `decodeToken` can
 * actually parse. These helpers mint one (standard three-segment JWT shape)
 * with the claims the real `POST /api/auth/login` issues.
 */

export interface TestClaims {
  userId: string;
  displayName: string;
  role: Role;
  jurisdictionId: string;
}

/** Claims of the default signed-in investigator — matches `fixtures._session`. */
export const INSPECTOR_DELHI: TestClaims = {
  userId: "USER_3CC3F8041605",
  displayName: "Insp. Rao",
  role: "INSPECTOR",
  jurisdictionId: "JURISDICTION_DELHI_CYBERCRIME",
};

export const SUPERVISOR_DELHI: TestClaims = {
  userId: "USER_SUPERVISOR_DELHI",
  displayName: "Supt. Verma",
  role: "SUPERVISOR",
  jurisdictionId: "JURISDICTION_DELHI_CYBERCRIME",
};

export const SUPERVISOR_MUMBAI: TestClaims = {
  userId: "USER_SUPERVISOR_MUMBAI",
  displayName: "Supt. Kulkarni",
  role: "SUPERVISOR",
  jurisdictionId: "JURISDICTION_MUMBAI_CYBERCRIME",
};

export const ADMIN_DELHI: TestClaims = {
  userId: "USER_ADMIN_DELHI",
  displayName: "Dy. Comm. Sharma",
  role: "ADMIN",
  jurisdictionId: "JURISDICTION_DELHI_CYBERCRIME",
};

export const AUDIT_LOGGER_DELHI: TestClaims = {
  userId: "USER_AUDIT_DELHI",
  displayName: "Aud. Iyer",
  role: "AUDIT_LOGGER",
  jurisdictionId: "JURISDICTION_DELHI_CYBERCRIME",
};

function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Mint an unsigned-but-well-formed JWT carrying `claims`. */
export function makeToken(claims: TestClaims): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = base64UrlEncode(
    JSON.stringify({
      user_id: claims.userId,
      display_name: claims.displayName,
      role: claims.role,
      jurisdiction_id: claims.jurisdictionId,
      provider: "credential",
      iat: now,
      exp: now + 12 * 60 * 60,
    }),
  );
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  return `${header}.${payload}.test-signature`;
}

/** Store a token for `claims` (defaults to the inspector identity). */
export function seedToken(claims: TestClaims = INSPECTOR_DELHI): string {
  const token = makeToken(claims);
  localStorage.setItem("crimenet.token", token);
  return token;
}
