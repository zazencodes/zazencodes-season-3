import { createAuthClient } from "@neondatabase/auth";

/** Better Auth client talking to the Function's same-origin proxy at /api/auth. */
export const authClient = createAuthClient(`${window.location.origin}/api/auth`);
