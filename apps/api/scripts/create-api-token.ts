import process from "node:process";
import { randomBytes } from "node:crypto";
import { hashApiToken } from "../src/api-token/api-token.hash.js";
import { insertApiToken, UnknownTokenOwnerError } from "../src/api-token/api-token.repo.js";
import { parseScopeList, type ApiTokenScope } from "../src/api-token/api-token.scopes.js";
import { closeDb } from "../src/db/client.js";

interface Args {
  label?: string;
  email?: string;
  scopes: ApiTokenScope[];
}

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  let email: string | undefined;
  let scopes: ApiTokenScope[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;

    if (arg === "--email") {
      email = argv[++i];
    } else if (arg.startsWith("--email=")) {
      email = arg.slice("--email=".length);
    } else if (arg === "--scopes") {
      scopes = parseScopeList(argv[++i] ?? "");
    } else if (arg.startsWith("--scopes=")) {
      scopes = parseScopeList(arg.slice("--scopes=".length));
    } else {
      positional.push(arg);
    }
  }

  return { label: positional[0], email, scopes };
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to mint an api token");
  }

  const { label, email, scopes } = parseArgs(process.argv.slice(2));

  if (email !== undefined && !email.includes("@")) {
    throw new Error("--email needs an address, e.g. --email me@example.com");
  }

  if (!label) {
    throw new Error(
      'usage: tsx scripts/create-api-token.ts <label> [--email <address>] [--scopes knowledge:write], e.g. "Ilya\'s phone"',
    );
  }

  const rawToken = `pat_${randomBytes(32).toString("hex")}`;
  const tokenHash = hashApiToken(rawToken);

  try {
    await insertApiToken({ label, tokenHash, ownerEmail: email, scopes });
  } finally {
    await closeDb();
  }

  const scopeNote = scopes.length > 0 ? ` with scopes ${scopes.join(", ")}` : " with no scopes (read access only)";

  console.log(`Token minted for "${label}"${scopeNote}. Save it now — it will not be shown again:\n`);
  console.log(rawToken);
}

main().catch((err: unknown) => {
  console.error(err instanceof UnknownTokenOwnerError ? err.message : err);
  process.exit(1);
});
