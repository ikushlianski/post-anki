import process from "node:process";
import { closeDb } from "../src/db/client.ts";
import { generateItemsForSource } from "../src/knowledge-bit/detect-knowledge-bits.orchestrator.ts";
import { assertReextractTarget } from "../src/knowledge-source/knowledge-source-reextract.ts";
import { parseImportBackfillArgs } from "../src/knowledge-source/import-cloze-backfill.ts";
import {
  listVerbatimClozeImportCandidates,
  retireVerbatimClozeCards,
} from "../src/knowledge-source/import-cloze-backfill.repo.ts";
import { claimSourceForRegeneration } from "../src/knowledge-source/knowledge-source-regeneration.repo.ts";

async function main() {
  const args = parseImportBackfillArgs(process.argv.slice(2));

  assertReextractTarget(process.env.DATABASE_URL, args.allowRemote);

  const candidates = await listVerbatimClozeImportCandidates({ limit: args.limit });
  const cardCount = candidates.reduce((sum, candidate) => sum + candidate.pendingBitIds.length, 0);

  console.log(
    `${args.apply ? "APPLY" : "DRY RUN"}: ${candidates.length} imported source(s), ${cardCount} pending verbatim cloze card(s) to rebuild`,
  );
  console.log("expected model calls (about 2 per source plus up to 4 searches)");
  candidates.forEach((candidate) => console.log(`  ${candidate.id}  pendingCards=${candidate.pendingBitIds.length}`));

  if (!args.apply) {
    console.log("dry run only: nothing changed. Add --apply to re-extract these sources (calls the real model).");
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
      const result = await generateItemsForSource({ ...claim.source, rawText: candidate.factText });
      const retired =
        result.status === "detected" && result.inserted > 0
          ? await retireVerbatimClozeCards(candidate.id, candidate.pendingBitIds)
          : 0;

      console.log(
        `  ${candidate.id}: ${result.status}, inserted ${result.inserted}, retired ${retired}` +
          (result.failureReason ? `, reason=${result.failureReason}` : ""),
      );
    } catch (err) {
      console.error(`  ${candidate.id}: extraction threw, old cards kept`, err);
    }
  }

  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
