import process from "node:process";
import { closeDb } from "../src/db/client.ts";
import { parseApproveWaitingCardsArgs, runApproveWaitingCards } from "../src/knowledge-bit/approve-waiting-cards.ts";
import { approveWaitingCardsClient } from "../src/knowledge-bit/approve-waiting-cards.repo.ts";
import { assertReextractTarget } from "../src/knowledge-source/knowledge-source-reextract.ts";

async function main() {
  const args = parseApproveWaitingCardsArgs(process.argv.slice(2));

  assertReextractTarget(process.env.DATABASE_URL, args.allowRemote);

  const report = await runApproveWaitingCards(approveWaitingCardsClient(), args);

  for (const { subject, count } of report.perSubject) {
    console.log(`${subject}: ${count}`);
  }

  console.log(`skipped (no active variant): ${report.skippedNoVariant}`);
  console.log(`skipped (no subject): ${report.skippedNoSubject}`);
  console.log(`approved-never-studied cards in total: ${report.approvedUnseenTotal}`);
  console.log(
    report.applied
      ? `APPLY: approved ${report.approved} of ${report.eligible} eligible card(s)`
      : `DRY RUN: ${report.eligible} card(s) would be approved. Add --apply to write.`,
  );
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
