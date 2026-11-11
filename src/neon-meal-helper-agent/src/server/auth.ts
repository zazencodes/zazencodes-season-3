// Neon Auth (Managed Better Auth), proxied through this Function so the session
// cookie is first-party on the app's own origin.
//
// Only Neon Auth's session token cookie is passed to the browser. Responses carry
// at most one Set-Cookie, because the Functions runtime keeps only one of them.

import type { Context, MiddlewareHandler } from "hono";

const baseUrl = process.env.NEON_AUTH_BASE_URL;
if (!baseUrl) throw new Error("Missing environment variable NEON_AUTH_BASE_URL");

const SESSION_COOKIE = "__Secure-neon-auth.session_token";

/** Call Neon Auth on behalf of the browser, forwarding only the session cookie. */
async function callNeonAuth(c: Context, path: string, method: string, body?: ArrayBuffer) {
  const headers = new Headers({ origin: c.req.header("origin") ?? new URL(c.req.url).origin });
  const contentType = c.req.header("content-type");
  if (contentType) headers.set("content-type", contentType);
  const session = c.req.header("cookie")?.split(/;\s*/).find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  if (session) headers.set("cookie", session);
  return fetch(`${baseUrl}/${path}${new URL(c.req.url).search}`, { method, headers, body, redirect: "manual" });
}

/** Neon Auth's session cookie from an upstream response, rewritten for a same-origin app. */
function firstPartySessionCookie(upstream: Response): string | null {
  const cookie = upstream.headers.getSetCookie().find((value) => value.startsWith(`${SESSION_COOKIE}=`));
  if (!cookie) return null;
  const attributes = cookie
    .split(/;\s*/)
    .filter((part) => !/^(samesite|partitioned|domain)\b/i.test(part));
  return [...attributes, "SameSite=Strict"].join("; ");
}

/** Mounted at /api/auth/*: forwards the Better Auth client's calls to Neon Auth. */
export const authProxy: MiddlewareHandler = async (c) => {
  const method = c.req.method;
  const body = method === "GET" || method === "HEAD" ? undefined : await c.req.arrayBuffer();
  const upstream = await callNeonAuth(c, c.req.path.replace(/^\/api\/auth\//, ""), method, body);
  const headers = new Headers();
  for (const name of ["content-type", "location"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  const cookie = firstPartySessionCookie(upstream);
  if (cookie) headers.set("set-cookie", cookie);
  return new Response(upstream.body, { status: upstream.status, headers });
};

export type AuthVariables = { userId: string };

/** Rejects requests without a signed-in session and exposes the user's id. */
export const requireUser: MiddlewareHandler<{ Variables: AuthVariables }> = async (c, next) => {
  const upstream = await callNeonAuth(c, "get-session", "GET");
  if (!upstream.ok) throw new Error(`Neon Auth session lookup failed: ${upstream.status} ${await upstream.text()}`);
  const session = (await upstream.json()) as { user: { id: string } } | null;
  if (!session?.user) return c.json({ error: "Unauthorized" }, 401);
  // Neon Auth extends the session cookie as it is used; pass the refreshed cookie on.
  const cookie = firstPartySessionCookie(upstream);
  if (cookie) c.header("set-cookie", cookie);
  c.set("userId", session.user.id);
  await next();
};
