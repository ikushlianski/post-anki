import process from "node:process";
import { closeDb } from "../src/db/client.ts";
import { parseCardKeyBackfillArgs, runCardKeyBackfill } from "../src/knowledge-bit/card-key-backfill.ts";
import { cardKeyBackfillClient } from "../src/knowledge-bit/card-key-backfill.repo.ts";
import { assertReextractTarget } from "../src/knowledge-source/knowledge-source-reextract.ts";

async function main() {
  const args = parseCardKeyBackfillArgs(process.argv.slice(2));

  assertReextractTarget(process.env.DATABASE_URL, args.allowRemote);

  const count = await runCardKeyBackfill(cardKeyBackfillClient(), { apply: args.apply });

  console.log(
    args.apply
      ? `APPLY: keyed ${count} active variant(s)`
      : `DRY RUN: ${count} active variant(s) would be keyed. Add --apply to write.`,
  );
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
