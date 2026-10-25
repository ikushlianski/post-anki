import process from "node:process";
import pg from "pg";
import { resetApprovedBitsToPending } from "../src/knowledge-bit/reset-approved-bits-to-pending.js";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (process.argv.length > 2) {
    throw new Error("This script takes no arguments");
  }

  const client = new pg.Client({ connectionString: databaseUrl });

  await client.connect();

  try {
    const summary = await resetApprovedBitsToPending(client, databaseUrl);

    console.log(`Host: ${summary.host}  Database: ${summary.database}`);
    console.log(`Before: ${JSON.stringify(summary.before)}`);
    console.log(
      `Moved ${summary.bitsReset} approved cards back to pending; reopened ${summary.sourcesReopened} processed sources.`,
    );
    console.log(`After: ${JSON.stringify(summary.after)}`);
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : "reset-approved-cards-to-pending failed");
  process.exit(1);
});
