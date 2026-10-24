import process from "node:process";
import { closeDb } from "../src/db/client.ts";
import { generateItemsForSource } from "../src/knowledge-bit/detect-knowledge-bits.orchestrator.ts";
import {
  assertReextractTarget,
  parseReextractArgs,
} from "../src/knowledge-source/knowledge-source-reextract.ts";
import {
  claimSourceAndSupersedeAllBits,
  listReextractCandidates,
} from "../src/knowledge-source/knowledge-source-reextract.repo.ts";

async function main() {
  const args = parseReextractArgs(process.argv.slice(2));

  assertReextractTarget(process.env.DATABASE_URL, args.allowRemote);

  const candidates = await listReextractCandidates(args.subjectId ? { subjectId: args.subjectId } : {});
  const bitTotal = candidates.reduce((sum, candidate) => sum + candidate.liveBitCount, 0);

  console.log(`${args.apply ? "APPLY" : "DRY RUN"}: ${candidates.length} source(s), ${bitTotal} live bit(s)`);
  candidates.forEach((candidate) =>
    console.log(
      `  ${candidate.id}  status=${candidate.status}  subject=${candidate.subjectId ?? "-"}  ` +
        `chars=${candidate.rawTextLength}  liveBits=${candidate.liveBitCount}`,
    ),
  );

  if (!args.apply) {
    console.log("dry run only: nothing changed. Add --apply to supersede these bits and re-extract (calls the real model).");
    await closeDb();

    return;
  }

  for (const candidate of candidates) {
    const claim = await claimSourceAndSupersedeAllBits(candidate.id);

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
