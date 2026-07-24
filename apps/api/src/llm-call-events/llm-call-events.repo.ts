import { desc, lt } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { llmCallEvents } from "../db/schema.js";
import { newId } from "../shared/id.js";
import { log } from "../shared/log.js";

// How long a call event is worth keeping around for the admin observability
// view — old rows carry no ongoing value once nobody could plausibly still
// be debugging them.
const RETENTION_DAYS = 30;

// Run the retention delete opportunistically instead of on every insert or
// via a dedicated cron process — cheap, bounded, and avoids adding any new
// infrastructure just to keep one table from growing unbounded. 1-in-50
// inserts is frequent enough that the table never grows far past 30 days of
// data, and rare enough that a DELETE never rides along with the common
// case.
const CLEANUP_CHANCE = 1 / 50;

export interface LlmCallEventInput {
  curriculumId: string | null;
  op: string;
  agentKey: string;
  durationMs: number;
  success: boolean;
  errorMessage: string | null;
}

/**
 * Records the final outcome of one `generateWithRetry()` call —
 * success/failure of the whole retry sequence, not each individual attempt.
 * Never throws: observability plumbing must never break or mask the actual
 * LLM-call result, so a DB write failure here is caught and logged via pino
 * instead of propagating.
 */
export async function recordLlmCallEvent(input: LlmCallEventInput): Promise<void> {
  try {
    await getDb()
      .insert(llmCallEvents)
      .values({
        id: newId("llmevt"),
        curriculumId: input.curriculumId,
        op: input.op,
        agentKey: input.agentKey,
        durationMs: input.durationMs,
        success: input.success,
        errorMessage: input.errorMessage,
      });
  } catch (err) {
    log.warn(
      { err, op: input.op, curriculumId: input.curriculumId },
      "llm_call_event_write_failed",
    );

    return;
  }

  if (Math.random() < CLEANUP_CHANCE) {
    await cleanupOldEvents();
  }
}

async function cleanupOldEvents(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

    await getDb().delete(llmCallEvents).where(lt(llmCallEvents.createdAt, cutoff));
  } catch (err) {
    log.warn({ err }, "llm_call_event_cleanup_failed");
  }
}

export interface RecentLlmCallEvent {
  id: string;
  curriculumId: string | null;
  op: string;
  agentKey: string;
  durationMs: number;
  success: boolean;
  errorMessage: string | null;
  createdAt: string;
}

export async function getRecentLlmCallEvents(limit = 50): Promise<RecentLlmCallEvent[]> {
  const rows = await getDb()
    .select()
    .from(llmCallEvents)
    .orderBy(desc(llmCallEvents.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    curriculumId: r.curriculumId,
    op: r.op,
    agentKey: r.agentKey,
    durationMs: r.durationMs,
    success: r.success,
    errorMessage: r.errorMessage,
    createdAt: r.createdAt.toISOString(),
  }));
}
