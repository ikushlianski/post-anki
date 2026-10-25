import process from "node:process";
import { closeDb, getDb } from "../src/db/client.js";
import { assertLocalOrConfirmed } from "../src/db/assert-local-or-confirmed.js";
import { revokeApiToken } from "../src/api-token/revoke-api-token.js";

const PROBLEMS = {
  not_found: "No key with that id or label",
  ambiguous: "Several active keys share that label; pass the key id instead",
  already_revoked: "That key is already revoked",
} as const;

async function main() {
  assertLocalOrConfirmed(process.env.DATABASE_URL, process.env);

  const selector = process.argv[2];

  if (!selector) {
    throw new Error("usage: npm run db:revoke-api-token -w @post-anki/api -- <label-or-id>");
  }

  try {
    const result = await revokeApiToken(getDb(), selector);

    if (!result.ok) {
      throw new Error(PROBLEMS[result.reason]);
    }

    console.log(`Revoked "${result.label}" (${result.id}). Ended ${result.sessionsEnded} owner session(s).`);
  } finally {
    await closeDb();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : "revoke-api-token failed");
  process.exit(1);
});
