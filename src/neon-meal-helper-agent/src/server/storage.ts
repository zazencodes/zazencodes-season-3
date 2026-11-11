import { Files } from "files-sdk";
import { neon } from "files-sdk/neon";

/** Private bucket for uploaded recipe files, declared in neon.ts. */
export const files = new Files({ adapter: neon({ bucket: "recipe-files" }) });

/** Uploads the agent can read: images it can look at, and text it can parse. */
export function isSupportedUpload(contentType: string) {
  return contentType.startsWith("image/") || contentType.startsWith("text/");
}

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
