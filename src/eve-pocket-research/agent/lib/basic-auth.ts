import type { HttpBasicCredentials } from "eve/channels/auth";

/** The one username and password that guard both the web app and the agent routes. */
export function basicAuthCredentials(): HttpBasicCredentials {
  const username = process.env.BASIC_AUTH_USERNAME;
  const password = process.env.BASIC_AUTH_PASSWORD;
  if (!username || !password) {
    throw new Error("BASIC_AUTH_USERNAME and BASIC_AUTH_PASSWORD must be set");
  }
  return { username, password };
}

export const BASIC_AUTH_REALM = "Pocket Research";
