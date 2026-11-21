import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { synthesisMiningClusters } from "../db/schema.js";

export async function countSynthesizedSince(since: Date): Promise<number> {
  const [row] = await getDb()
    .select({ count: sql<string>`count(*)` })
    .from(synthesisMiningClusters)
    .where(
      and(
        eq(synthesisMiningClusters.outcome, "synthesized"),
        gte(synthesisMiningClusters.createdAt, since),
      ),
    );

  return Number(row?.count ?? 0);
}
