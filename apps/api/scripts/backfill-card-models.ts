import process from "node:process";
import { closeDb } from "../src/db/client.ts";
import {
  countBits,
  parseCardModelBackfillArgs,
  planCardModelBackfill,
} from "../src/knowledge-bit/card-model-backfill.ts";
import {
  copyStampToRecords,
  listUnstampedCardCandidates,
  stampCards,
} from "../src/knowledge-bit/card-model-backfill.repo.ts";
import { assertReextractTarget } from "../src/knowledge-source/knowledge-source-reextract.ts";

async function main() {
  const args = parseCardModelBackfillArgs(process.argv.slice(2));

  assertReextractTarget(process.env.DATABASE_URL, args.allowRemote);

  const mode = args.apply ? "APPLY" : "DRY RUN";
  const plan = planCardModelBackfill(await listUnstampedCardCandidates());

  console.log(`${mode}: ${countBits(plan.reliable)} card(s) with a provable model (single fusion model or source override)`);

  for (const [modelId, ids] of plan.reliable) {
    console.log(`  ${modelId}: ${ids.length}`);
  }

  console.log(
    `${countBits(plan.inferred)} more card(s) could be inferred from the model recorded at rating time` +
      `${args.fromFeedback ? " (included, --from-feedback)" : " (not applied without --from-feedback)"}`,
  );

  for (const [modelId, ids] of plan.inferred) {
    console.log(`  ${modelId}: ${ids.length}`);
  }

  console.log(`${plan.skipped} card(s) stay unknown`);

  if (!args.apply) {
    console.log("dry run only: nothing changed. Add --apply to fill empty model stamps.");
    await closeDb();

    return;
  }

  const stamped = await stampCards(plan.reliable);
  const inferred = args.fromFeedback ? await stampCards(plan.inferred) : 0;
  const copied = await copyStampToRecords();

  console.log(
    `stamped ${stamped} card(s), ${inferred} inferred; filled ${copied.decisions} decision(s) and ${copied.feedback} feedback row(s)`,
  );
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
