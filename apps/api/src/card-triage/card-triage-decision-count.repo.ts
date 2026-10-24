import { and, desc, gte, inArray } from "drizzle-orm";
import type { TriageDecision } from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { knowledgeBitFeedback } from "../db/schema.js";

export interface ConfirmedTriageCounts {
  accepted: number;
  rejected: number;
}

// Counts a client decision only when the latest feedback row for that bit since the session
// started carries the same verdict; unknown bits and stale claims are ignored.
export async function countConfirmedDecisions(
  startedAt: Date,
  decisions: TriageDecision[],
  db: DbExecutor = getDb(),
): Promise<ConfirmedTriageCounts> {
  const claimed = new Map(decisions.map((decision) => [decision.bitId, decision.verdict]));

  if (claimed.size === 0) {
    return { accepted: 0, rejected: 0 };
  }

  const rows = await db
    .select({ bitId: knowledgeBitFeedback.knowledgeBitId, verdict: knowledgeBitFeedback.verdict })
    .from(knowledgeBitFeedback)
    .where(
      and(
        inArray(knowledgeBitFeedback.knowledgeBitId, [...claimed.keys()]),
        gte(knowledgeBitFeedback.createdAt, startedAt),
      ),
    )
    .orderBy(desc(knowledgeBitFeedback.createdAt));

  const latest = new Map<string, string>();

  for (const row of rows) {
    if (!latest.has(row.bitId)) {
      latest.set(row.bitId, row.verdict);
    }
  }

  const counts = { accepted: 0, rejected: 0 };

  for (const [bitId, verdict] of claimed) {
    if (latest.get(bitId) !== verdict) {
      continue;
    }

    if (verdict === "approved") {
      counts.accepted += 1;
    } else {
      counts.rejected += 1;
    }
  }

  return counts;
}
