import { createHash } from "node:crypto";

export function hashApiToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}
