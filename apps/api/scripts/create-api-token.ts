import process from "node:process";
import { randomBytes } from "node:crypto";
import { hashApiToken } from "../src/api-token/api-token.hash.js";
import { insertApiToken, UnknownTokenOwnerError } from "../src/api-token/api-token.repo.js";
import { closeDb } from "../src/db/client.js";

function parseArgs(argv: string[]): { label?: string; email?: string } {
  const positional: string[] = [];
  let email: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--email") {
      email = argv[++i];
    } else if (argv[i]?.startsWith("--email=")) {
      email = argv[i]!.slice("--email=".length);
    } else {
      positional.push(argv[i]!);
    }
  }

  return { label: positional[0], email };
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to mint an api token");
  }

  const { label, email } = parseArgs(process.argv.slice(2));

  if (email !== undefined && !email.includes("@")) {
    throw new Error("--email needs an address, e.g. --email me@example.com");
  }

  if (!label) {
    throw new Error(
      "usage: tsx scripts/create-api-token.ts <label> [--email <address>], e.g. \"Ilya's phone\"",
    );
  }

  const rawToken = `pat_${randomBytes(32).toString("hex")}`;
  const tokenHash = hashApiToken(rawToken);

  try {
    await insertApiToken({ label, tokenHash, ownerEmail: email });
  } finally {
    await closeDb();
  }

  console.log(`Token minted for "${label}". Save it now — it will not be shown again:\n`);
  console.log(rawToken);
}

main().catch((err: unknown) => {
  console.error(err instanceof UnknownTokenOwnerError ? err.message : err);
  process.exit(1);
});
