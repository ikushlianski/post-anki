import { and, asc, eq, isNotNull, lte, ne } from "drizzle-orm";
import type { NotionSourceFrequency } from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { notionIngestionSources } from "../db/schema.js";
import { computeNextRunAt } from "./next-run-at.js";
import type { NotionSourceRow } from "./notion-ingestion-source.repo.js";

export const CLAIM_LEASE_MS = 20 * 60 * 1000;

export interface ClaimedNotionSource {
  source: NotionSourceRow;
  previousNextRunAt: Date;
}

export async function listDueNotionSources(now: Date, db: DbExecutor = getDb()): Promise<NotionSourceRow[]> {
  return db
    .select()
    .from(notionIngestionSources)
    .where(
      and(
        eq(notionIngestionSources.paused, false),
        ne(notionIngestionSources.frequency, "manual"),
        isNotNull(notionIngestionSources.nextRunAt),
        lte(notionIngestionSources.nextRunAt, now),
      ),
    )
    .orderBy(asc(notionIngestionSources.nextRunAt));
}

// Compare-and-set on the next_run_at value that made the source due; the short lease keeps it due again if the process dies mid-run.
export async function claimDueNotionSource(
  candidate: NotionSourceRow,
  now: Date,
  db: DbExecutor = getDb(),
): Promise<ClaimedNotionSource | null> {
  if (!candidate.nextRunAt) {
    return null;
  }

  const [claimed] = await db
    .update(notionIngestionSources)
    .set({ nextRunAt: new Date(now.getTime() + CLAIM_LEASE_MS), updatedAt: now })
    .where(
      and(
        eq(notionIngestionSources.id, candidate.id),
        eq(notionIngestionSources.nextRunAt, candidate.nextRunAt),
        eq(notionIngestionSources.paused, false),
        ne(notionIngestionSources.frequency, "manual"),
      ),
    )
    .returning();

  return claimed ? { source: claimed, previousNextRunAt: candidate.nextRunAt } : null;
}

export async function restoreNextRunAt(
  claimed: ClaimedNotionSource,
  db: DbExecutor = getDb(),
): Promise<void> {
  if (!claimed.source.nextRunAt) {
    return;
  }

  await db
    .update(notionIngestionSources)
    .set({ nextRunAt: claimed.previousNextRunAt })
    .where(
      and(
        eq(notionIngestionSources.id, claimed.source.id),
        eq(notionIngestionSources.nextRunAt, claimed.source.nextRunAt),
      ),
    );
}

export async function settleNextRunAt(
  claimed: ClaimedNotionSource,
  now: Date,
  db: DbExecutor = getDb(),
): Promise<void> {
  if (!claimed.source.nextRunAt) {
    return;
  }

  await db
    .update(notionIngestionSources)
    .set({ nextRunAt: computeNextRunAt(claimed.source.frequency as NotionSourceFrequency, now) })
    .where(
      and(
        eq(notionIngestionSources.id, claimed.source.id),
        eq(notionIngestionSources.nextRunAt, claimed.source.nextRunAt),
      ),
    );
}
