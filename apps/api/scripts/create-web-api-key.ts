import process from "node:process";
import { randomBytes } from "node:crypto";
import { hashApiToken } from "../src/api-token/api-token.hash.js";
import { insertApiToken } from "../src/api-token/api-token.repo.js";
import { closeDb, getDb } from "../src/db/client.js";
import { assertLocalOrConfirmed } from "../src/db/assert-local-or-confirmed.js";
import { ensureOwnerUser } from "../src/auth/owner-user.js";

const DEFAULT_LABEL = "web";

async function main() {
  assertLocalOrConfirmed(process.env.DATABASE_URL, process.env);

  const label = process.argv[2] ?? DEFAULT_LABEL;
  const rawToken = `pat_${randomBytes(32).toString("hex")}`;

  try {
    const { email } = await ensureOwnerUser(getDb());

    await insertApiToken({ label, tokenHash: hashApiToken(rawToken), ownerEmail: email });
  } finally {
    await closeDb();
  }

  console.log(`Web key "${label}" minted. Save it in a password manager now; it will not be shown again:\n`);
  console.log(rawToken);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : "create-web-api-key failed");
  process.exit(1);
});
