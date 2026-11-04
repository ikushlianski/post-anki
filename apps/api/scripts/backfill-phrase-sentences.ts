import process from "node:process";
import { closeDb } from "../src/db/client.ts";
import { generateItemsForSource } from "../src/knowledge-bit/detect-knowledge-bits.orchestrator.ts";
import { assertReextractTarget } from "../src/knowledge-source/knowledge-source-reextract.ts";
import { splitPhraseContextsAndRefreshEmbeddings } from "../src/knowledge-source/phrase-context-split.orchestrator.ts";
import { parsePhraseBackfillArgs } from "../src/knowledge-source/phrase-sentence-backfill.ts";
import {
  listPhraseContextSplits,
  listPhraseSentenceBackfillCandidates,
} from "../src/knowledge-source/phrase-sentence-backfill.repo.ts";
import { claimSourceForRegeneration } from "../src/knowledge-source/knowledge-source-regeneration.repo.ts";

async function main() {
  const args = parsePhraseBackfillArgs(process.argv.slice(2));

  assertReextractTarget(process.env.DATABASE_URL, args.allowRemote);

  const splits = await listPhraseContextSplits();

  console.log(`${args.apply ? "APPLY" : "DRY RUN"}: ${splits.length} two-line phrase front(s) to split into front + context (no model call)`);

  if (args.apply && splits.length > 0) {
    console.log(`  split ${await splitPhraseContextsAndRefreshEmbeddings(splits)} front(s)`);
  }

  if (args.splitOnly) {
    if (!args.apply) {
      console.log("dry run only: nothing changed. Add --apply to split.");
    }

    await closeDb();

    return;
  }

  const candidates = await listPhraseSentenceBackfillCandidates(args.limit === undefined ? {} : { limit: args.limit });

  console.log(
    `${args.apply ? "APPLY" : "DRY RUN"}: ${candidates.length} phrase source(s), ` +
      `${candidates.length} model call(s) expected (up to ${candidates.length * 2} on bad output)`,
  );
  candidates.forEach((candidate) =>
    console.log(`  ${candidate.id}  chars=${candidate.rawTextLength}  pendingBits=${candidate.pendingBitCount}`),
  );

  if (!args.apply) {
    console.log("dry run only: nothing changed. Add --apply to rewrite the fronts and sentences of these pending cards (calls the real model).");
    await closeDb();

    return;
  }

  for (const candidate of candidates) {
    const claim = await claimSourceForRegeneration(candidate.id);

    if (!claim.ok) {
      console.log(`  ${candidate.id}: skipped (${claim.error})`);
      continue;
    }

    try {
      const result = await generateItemsForSource(claim.source);

      console.log(
        `  ${candidate.id}: superseded ${claim.supersededCount}, ${result.status}, inserted ${result.inserted}` +
          (result.failureReason ? `, reason=${result.failureReason}` : ""),
      );
    } catch (err) {
      console.error(`  ${candidate.id}: superseded ${claim.supersededCount}, extraction threw`, err);
    }
  }

  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
