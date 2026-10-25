import process from "node:process";
import { closeDb, getDb } from "../src/db/client.js";
import { createOwnerUser } from "../src/auth/create-user.js";

async function main() {
  const email = process.argv[2];

  if (!email?.includes("@")) {
    throw new Error("usage: npm run db:create-user -w @post-anki/api -- <email>");
  }

  const result = await createOwnerUser(getDb(), email);

  await closeDb();
  console.log(result.created ? `User created: ${result.email}` : `User already exists: ${result.email}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : "create-user failed");
  process.exit(1);
});
