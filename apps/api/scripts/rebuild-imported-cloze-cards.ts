import process from "node:process";
import { closeDb } from "../src/db/client.ts";
import { generateItemsForSource } from "../src/knowledge-bit/detect-knowledge-bits.orchestrator.ts";
import { assertReextractTarget } from "../src/knowledge-source/knowledge-source-reextract.ts";
import { parseImportBackfillArgs, settleRebuiltSource } from "../src/knowledge-source/import-cloze-backfill.ts";
import {
  listVerbatimClozeImportCandidates,
  restoreRebuiltCards,
} from "../src/knowledge-source/import-cloze-backfill.repo.ts";
import { claimSourceForRegeneration } from "../src/knowledge-source/knowledge-source-regeneration.repo.ts";

interface InFlight {
  sourceId: string;
  bitIds: readonly string[];
  keepRetired: boolean;
}

let inFlight: InFlight | null = null;

async function safeRestore(sourceId: string, bitIds: readonly string[]): Promise<number> {
  try {
    return await restoreRebuiltCards(sourceId, bitIds);
  } catch (err) {
    console.error(`  ${sourceId}: restore failed, cards need manual recovery: ${bitIds.join(",")}`, err);

    return 0;
  }
}

async function stopOnSignal(signal: string) {
  console.error(`${signal}: restoring the card set being rebuilt`);

  if (inFlight && !inFlight.keepRetired) {
    await safeRestore(inFlight.sourceId, inFlight.bitIds);
  }

  await closeDb().catch(() => undefined);
  process.exit(1);
}

async function rebuild(candidates: Awaited<ReturnType<typeof listVerbatimClozeImportCandidates>>) {
  let kept = 0;
  let retired = 0;

  for (const candidate of candidates) {
    const claim = await claimSourceForRegeneration(candidate.id);

    if (!claim.ok) {
      console.log(`  ${candidate.id}: skipped (${claim.error})`);
      continue;
    }

    const current: InFlight = { sourceId: candidate.id, bitIds: claim.supersededIds, keepRetired: false };

    inFlight = current;
    console.log(`  ${candidate.id}: claimed, old cards hidden until the rebuild finishes (if the run is killed, this source stays in processing)`);

    try {
      const result = await generateItemsForSource({ ...claim.source, rawText: candidate.factText });
      current.keepRetired = result.inserted > 0;

      const settlement = await settleRebuiltSource(
        { sourceId: candidate.id, supersededIds: claim.supersededIds, supersededCount: claim.supersededCount },
        result,
        safeRestore,
      );

      kept += settlement.kept ? 1 : 0;
      retired += settlement.retired;
      console.log(settlement.line);
    } catch (err) {
      const restored = await safeRestore(candidate.id, claim.supersededIds);

      kept += 1;
      console.error(`  ${candidate.id}: extraction threw, kept ${restored} old card(s) pending`, err);
    } finally {
      inFlight = null;
    }
  }

  console.log(`done: ${retired} old card(s) retired, ${kept} source(s) kept`);
}

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

    return;
  }

  process.once("SIGINT", () => void stopOnSignal("SIGINT"));
  process.once("SIGTERM", () => void stopOnSignal("SIGTERM"));

  await rebuild(candidates);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb().catch(() => undefined));
