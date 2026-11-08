import process from "node:process";
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import pg from "pg";
import { count, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../src/db/schema.ts";
import { parseAnkiExport } from "../../anki-batch-mcp/src/anki-export-parser.ts";
import { buildStagedNotes } from "../src/anki-import/anki-import-staging.ts";
import { importIdSchema } from "../src/anki-import/anki-import.events.ts";
import { countImportNotesByStatus, stageImportNotes } from "../src/anki-import/anki-import.repo.ts";
import { createInngestClient } from "../src/shared/inngest-client.ts";

const CHUNK_SIZE = 200;

async function printStatus(db: ReturnType<typeof drizzle<typeof schema>>, importId: string) {
  const counts = await countImportNotesByStatus(importId, db);
  const detection = await db
    .select({ status: schema.knowledgeSources.status, total: count() })
    .from(schema.ankiImportNotes)
    .innerJoin(schema.knowledgeSources, eq(schema.knowledgeSources.id, schema.ankiImportNotes.sourceId))
    .where(eq(schema.ankiImportNotes.importId, importId))
    .groupBy(schema.knowledgeSources.status);

  console.log(JSON.stringify({ importId, ...counts, detection }, null, 2));
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      "import-id": { type: "string" },
      limit: { type: "string" },
      send: { type: "boolean", default: false },
      status: { type: "boolean", default: false },
    },
  });
  const importId = importIdSchema.parse(values["import-id"]);
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to stage an Anki import");
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });

  try {
    if (values.status) {
      await printStatus(db, importId);

      return;
    }

    const filePath = positionals[0];

    if (!filePath) {
      throw new Error("Usage: db:stage-anki-import <file> --import-id <id> [--limit N] [--send] | --status");
    }

    const limit = values.limit === undefined ? undefined : Number.parseInt(values.limit, 10);

    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
      throw new Error("--limit must be a positive integer");
    }

    const parsed = parseAnkiExport(await readFile(filePath, "utf8"));
    const outcome = buildStagedNotes(parsed.notes);

    if (!outcome.ok) {
      throw new Error(`file refused: ${JSON.stringify(outcome)}`);
    }

    const rows = limit === undefined ? outcome.rows : outcome.rows.slice(0, limit);
    let added = 0;

    for (let start = 0; start < rows.length; start += CHUNK_SIZE) {
      added += await stageImportNotes(importId, rows.slice(start, start + CHUNK_SIZE), db);
    }

    console.log(
      `parsed ${parsed.notes.length}, empty skipped ${outcome.skippedEmptyHashes.length} (${outcome.skippedEmptyHashes.join(", ")}), selected ${rows.length}, newly staged ${added}`,
    );

    const event = { name: "anki-import/requested", data: { importId } };

    if (values.send && process.env.INNGEST_EVENT_KEY) {
      await createInngestClient().send(event);
      console.log(`event sent for ${importId}`);
    } else {
      if (values.send) {
        console.error("INNGEST_EVENT_KEY is not set; event not sent");
      }

      console.log(JSON.stringify(event));
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
