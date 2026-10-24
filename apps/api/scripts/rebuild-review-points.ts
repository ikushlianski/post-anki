import process from "node:process";
import { assertLocalDbTarget } from "../src/db/assert-local-db-target.ts";
import { closeDb } from "../src/db/client.ts";
import { rebuildReviewPoints } from "../src/gamification/rebuild-review-points.ts";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  assertLocalDbTarget(databaseUrl);

  const { reviewed } = await rebuildReviewPoints();

  console.log(`review points rebuilt from ${reviewed} reviews`);
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
