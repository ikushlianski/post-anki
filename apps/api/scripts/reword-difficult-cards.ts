import process from "node:process";
import { parseArgs } from "node:util";
import { z } from "zod";
import { closeDb, getDb } from "../src/db/client.ts";
import { CARD_REWORDING_DEFAULT_LIMIT, runCardRewordingScan } from "../src/card-rewording/card-rewording.orchestrator.ts";

const argsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(CARD_REWORDING_DEFAULT_LIMIT),
  dryRun: z.boolean(),
});

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: { "dry-run": { type: "boolean" }, limit: { type: "string" } },
  });
  const args = argsSchema.parse({
    limit: values.limit ?? CARD_REWORDING_DEFAULT_LIMIT,
    dryRun: values["dry-run"] ?? false,
  });
  const result = await runCardRewordingScan(getDb(), args);

  console.log(JSON.stringify({ dryRun: args.dryRun, ...result }, null, 2));
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
