import process from "node:process";
import { closeDb, getDb } from "../src/db/client.js";
import { assertLocalOrConfirmed } from "../src/db/assert-local-or-confirmed.js";
import { describePasswordProblem, validateNewPassword } from "../src/auth/owner-password.js";
import { setOwnerPassword } from "../src/auth/set-owner-password.js";
import { readHiddenLine } from "./hidden-prompt.js";

async function main() {
  assertLocalOrConfirmed(process.env.DATABASE_URL, process.env);

  if (process.argv.length > 2) {
    throw new Error("This script takes no arguments; the password is typed at the prompt");
  }

  const password = await readHiddenLine("New owner password: ");
  const confirmation = await readHiddenLine("Repeat password: ");
  const check = validateNewPassword(password, confirmation);

  if (!check.ok) {
    throw new Error(describePasswordProblem(check.reason));
  }

  try {
    const { email } = await setOwnerPassword(getDb(), password);

    console.log(`Password set for ${email}. All existing sessions were ended.`);
  } finally {
    await closeDb();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : "set-owner-password failed");
  process.exit(1);
});
