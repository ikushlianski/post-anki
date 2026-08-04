import process from "node:process";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../src/db/schema.js";
import {
  runMigration,
  type MigrationSummary,
} from "../src/migrate-english-practice-data/migrate-english-practice-data.orchestrator.js";

const DEFAULT_SOURCE_LEARNING_DIR =
  "/Users/ikushlianski/webdata/ilya-projects/english-advanced/learning";

// SCENARIO 6 — every required env var is checked, by name, before any
// connection is attempted (dry-run included: it still needs both real
// connections to compute an accurate summary, per SCENARIO 5/6).
function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`migrate-english-practice-data: required env var ${name} is not set`);
  }

  return value;
}

function formatTableLine(label: string, count: { toCreate: number; alreadyPresent: number }): string {
  return `${label}: ${count.toCreate} to create, ${count.alreadyPresent} already present`;
}

function printSummary(summary: MigrationSummary): void {
  console.log(formatTableLine("phrases", summary.phrases));
  console.log(formatTableLine("attempts", summary.attempts));
  console.log(
    `phrase_bank_entries: ${summary.phraseBankEntries.toCreate} to create ` +
      `(${summary.phraseBankEntries.activeToCreate} active, ${summary.phraseBankEntries.masteredToCreate} mastered), ` +
      `${summary.phraseBankEntries.alreadyPresent} already present`,
  );
  console.log(
    `phrase_bank_appearances: ${summary.phraseBankAppearances.toCreate} to create, ` +
      `${summary.phraseBankAppearances.alreadyPresent} already present`,
  );

  if (summary.sampleEntry) {
    console.log(
      `sample derived entry: "${summary.sampleEntry.phraseText}" — status=${summary.sampleEntry.status}, ` +
        `level=${summary.sampleEntry.level}, scheduledForSentenceCount=${summary.sampleEntry.scheduledForSentenceCount}`,
    );
  }
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");

  const sourceDatabaseUrl = requireEnv("SOURCE_DATABASE_URL");
  const databaseUrl = requireEnv("DATABASE_URL");
  const learningDir = process.env.SOURCE_LEARNING_DIR ?? DEFAULT_SOURCE_LEARNING_DIR;

  const sourcePool = new pg.Pool({ connectionString: sourceDatabaseUrl });
  const targetPool = new pg.Pool({ connectionString: databaseUrl });
  const db = drizzle(targetPool, { schema });

  try {
    const summary = await runMigration({ dryRun, sourcePool, db, learningDir });

    console.log(dryRun ? "--- dry run: no rows written ---" : "--- migration complete ---");
    printSummary(summary);
  } finally {
    await sourcePool.end();
    await targetPool.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
