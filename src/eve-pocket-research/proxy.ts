import { verifyHttpBasic } from "eve/channels/auth";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { BASIC_AUTH_REALM, basicAuthCredentials } from "@/agent/lib/basic-auth";

export function proxy(request: NextRequest) {
  const routerHost = process.env.VERCEL_URL;
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (process.env.__VERCEL_DEV_RUNNING === "1" && routerHost && forwardedHost !== routerHost) {
    const target = request.nextUrl.clone();
    target.protocol = "http:";
    target.host = routerHost;
    return NextResponse.redirect(target);
  }

  const result = verifyHttpBasic(request.headers.get("authorization"), basicAuthCredentials());
  if (!result.ok) {
    return new NextResponse("Authentication required", {
      status: 401,
      headers: { "WWW-Authenticate": `Basic realm="${BASIC_AUTH_REALM}", charset="UTF-8"` },
    });
  }
  return NextResponse.next();
}

export const config = {
  // The eve channel authenticates its own routes, including eve's internal runtime callers.
  matcher: ["/((?!eve/|_next/static|_next/image).*)"],
};
