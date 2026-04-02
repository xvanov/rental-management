import { state } from "./state";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3001";

type FetchOptions = {
  auth?: boolean;
  headers?: Record<string, string>;
};

async function request(
  method: string,
  path: string,
  body?: unknown,
  opts: FetchOptions = { auth: true }
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...opts.headers,
  };

  if (opts.auth !== false && state.testAuthHeader) {
    headers["X-Test-Auth"] = state.testAuthHeader;
  }

  const url = `${BASE_URL}${path}`;
  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });

  return response;
}

// ─── Authenticated API calls ──────────────────────────────────────────

export function get(path: string) {
  return request("GET", path);
}

export function post(path: string, body?: unknown) {
  return request("POST", path, body);
}

export function patch(path: string, body?: unknown) {
  return request("PATCH", path, body);
}

export function del(path: string) {
  return request("DELETE", path);
}

// ─── Public (unauthenticated) API calls ───────────────────────────────

export function publicGet(path: string) {
  return request("GET", path, undefined, { auth: false });
}

export function publicPost(path: string, body?: unknown) {
  return request("POST", path, body, { auth: false });
}

export function publicPatch(path: string, body?: unknown) {
  return request("PATCH", path, body, { auth: false });
}

// ─── Helpers ──────────────────────────────────────────────────────────

export async function assertOk(res: Response, context?: string): Promise<unknown> {
  if (!res.ok) {
    const text = await res.text().catch(() => "(no body)");
    throw new Error(
      `${context ?? res.url} returned ${res.status}: ${text}`
    );
  }
  return res.json();
}

export async function assertCreated(res: Response, context?: string): Promise<unknown> {
  if (res.status !== 201) {
    const text = await res.text().catch(() => "(no body)");
    throw new Error(
      `${context ?? res.url} expected 201, got ${res.status}: ${text}`
    );
  }
  return res.json();
}
