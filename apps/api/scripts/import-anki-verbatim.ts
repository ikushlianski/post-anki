import process from "node:process";
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { z } from "zod";
import * as schema from "../src/db/schema.ts";
import { parseVerbatimExport } from "../src/anki-verbatim-import/anki-verbatim-parse.ts";
import { findTopLevelSubject, importVerbatimCards } from "../src/anki-verbatim-import/anki-verbatim-import.repo.ts";

const argsSchema = z.object({
  file: z.string().min(1),
  subject: z.string().min(1),
  "dry-run": z.boolean(),
});

async function main() {
  const { values } = parseArgs({
    options: {
      file: { type: "string" },
      subject: { type: "string" },
      "dry-run": { type: "boolean", default: false },
    },
  });
  const args = argsSchema.parse(values);
  const parsed = parseVerbatimExport(await readFile(args.file, "utf8"));
  const withExample = parsed.cards.filter((card) => card.example !== null).length;

  console.log(
    JSON.stringify({
      records: parsed.records,
      skippedEmpty: parsed.skippedEmpty,
      duplicatesInFile: parsed.duplicates,
      cards: parsed.cards.length,
      withExample,
      sample: parsed.cards.slice(0, 5),
    }, null, 2),
  );

  if (args["dry-run"]) return;

  const databaseUrl = z.string({ required_error: "DATABASE_URL is required" }).min(1).parse(process.env.DATABASE_URL);
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });

  try {
    const subject = await findTopLevelSubject(db, args.subject);

    if (!subject.ok) {
      const detail = subject.reason === "ambiguous" ? `: ${JSON.stringify(subject.matches)}` : "";

      throw new Error(`top-level subject "${args.subject}" ${subject.reason}${detail}`);
    }

    console.log(JSON.stringify(await importVerbatimCards(db, subject.subjectId, parsed.cards)));
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
