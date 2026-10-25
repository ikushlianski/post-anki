import type { Db } from "../db/client.js";
import { loadEnv } from "../shared/env.js";
import { createOwnerUser, normalizeEmail } from "./create-user.js";

export function getOwnerEmail(): string | undefined {
  const configured = loadEnv().OWNER_EMAIL;

  return configured ? normalizeEmail(configured) : undefined;
}

export function isOwnerEmail(submitted: string): boolean {
  const owner = getOwnerEmail();

  return owner !== undefined && normalizeEmail(submitted) === owner;
}

export async function ensureOwnerUser(db: Db): Promise<{ created: boolean; email: string }> {
  const owner = getOwnerEmail();

  if (!owner) {
    throw new Error("owner email is not configured");
  }

  return createOwnerUser(db, owner);
}
