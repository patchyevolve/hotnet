/**
 * CrimeNet — API client.
 *
 * The single place every service call goes through, so the signed bearer
 * token is attached in exactly one spot: `apiClient` adds
 * `Authorization: Bearer <token>` to *all* requests automatically. Pages
 * never touch `fetch` directly.
 *
 * Token lifecycle lives here too:
 *
 * 1. `POST /api/auth/login` stores the returned token (`setToken`).
 * 2. Every subscriber of `subscribeToAuth` is notified when the token
 *    changes (sign-in, sign-out, 401 expiry) so identity-derived state
 *    (`useIdentity`) re-renders without a page reload.
 * 3. A rejected token is dropped and the shell's handler sends the user
 *    back to sign-in instead of leaving them on a page whose writes fail.
 */

const TOKEN_KEY = "crimenet.token";
const AUTH_CHANGED_EVENT = "crimenet:auth-changed";

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable — the session simply will not persist */
  }
  notifyAuthChanged();
}

function notifyAuthChanged(): void {
  try {
    window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
  } catch {
    /* no window (non-browser runtime) — nothing to notify */
  }
}

/** Subscribe to token changes so identity consumers can re-read the JWT. */
export function subscribeToAuth(listener: () => void): () => void {
  window.addEventListener(AUTH_CHANGED_EVENT, listener);
  return () => window.removeEventListener(AUTH_CHANGED_EVENT, listener);
}

let unauthorizedHandler: (() => void) | null = null;

/**
 * Registered once by the app. Called when the stored token no longer
 * verifies (the signing secret rotated, or the token expired) so the shell
 * can send the investigator to sign-in instead of leaving them on a page
 * whose writes keep failing.
 */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init?.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(path, { ...init, headers });
  if (response.status === 401 && token) {
    // A rejected signature means the token this client holds is unusable.
    // Drop it and hand back a message an investigator can act on; the
    // registered handler navigates to sign-in.
    setToken(null);
    unauthorizedHandler?.();
    throw new ApiError(401, "Session expired. Please sign in again.");
  }
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(response.status, detail);
  }
  return (await response.json()) as T;
}

function postBody(body: unknown, init?: RequestInit): BodyInit | undefined {
  if (body === undefined) return init?.body ?? undefined;
  if (body instanceof FormData) return body;
  return JSON.stringify(body);
}

/**
 * Shared HTTP client. Every helper attaches the bearer token; callers only
 * choose the method, path and (for writes) the JSON body.
 */
export const apiClient = {
  request,
  get<T>(path: string, init?: RequestInit): Promise<T> {
    return request<T>(path, { ...init, method: "GET" });
  },
  post<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
    return request<T>(path, {
      ...init,
      method: "POST",
      body: postBody(body, init),
    });
  },
  put<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
    return request<T>(path, {
      ...init,
      method: "PUT",
      body: postBody(body, init),
    });
  },
  patch<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
    return request<T>(path, {
      ...init,
      method: "PATCH",
      body: postBody(body, init),
    });
  },
  delete<T>(path: string, init?: RequestInit): Promise<T> {
    return request<T>(path, { ...init, method: "DELETE" });
  },
};
