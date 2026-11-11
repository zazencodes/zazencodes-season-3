import { eveChannel } from "eve/channels/eve";
import { httpBasic, localDev, vercelOidc } from "eve/channels/auth";
import { BASIC_AUTH_REALM, basicAuthCredentials } from "../lib/basic-auth";

export default eveChannel({
  auth: [
    // Lets the eve TUI and eve's internal runtime callers reach the deployed agent.
    vercelOidc(),
    // The browser sends the same credentials the web app's login prompt collected.
    httpBasic(basicAuthCredentials(), { realm: BASIC_AUTH_REALM }),
    // Open on localhost for `eve dev` and the REPL; ignored in production.
    localDev(),
  ],
});
