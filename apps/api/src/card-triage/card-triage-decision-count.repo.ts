import { and, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import type { TriageDecision } from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { cardTriageDecisions, knowledgeBitFeedback, knowledgeBits } from "../db/schema.js";
import { loadDecisionContext } from "./card-triage-decision-context.repo.js";
import { findLiveDecision, insertDecisionRow, type DecisionDetails } from "./card-triage-decision.repo.js";
import type { TriageSessionRow } from "./card-triage-session.repo.js";

export interface ConfirmedTriageCounts {
  accepted: number;
  rejected: number;
}

interface ConfirmedDecision {
  claim: TriageDecision;
  feedbackId: string;
  modelId: string | null;
}

// A client decision counts only when the latest feedback row for that bit since the session
// started carries the same verdict; unknown bits and stale claims are ignored.
async function listConfirmedDecisions(
  startedAt: Date,
  decisions: TriageDecision[],
  db: DbExecutor,
): Promise<ConfirmedDecision[]> {
  const claimed = new Map(decisions.map((decision) => [decision.bitId, decision]));

  if (claimed.size === 0) {
    return [];
  }

  const rows = await db
    .select({
      id: knowledgeBitFeedback.id,
      bitId: knowledgeBitFeedback.knowledgeBitId,
      verdict: knowledgeBitFeedback.verdict,
      modelId: knowledgeBitFeedback.modelId,
    })
    .from(knowledgeBitFeedback)
    .where(
      and(
        inArray(knowledgeBitFeedback.knowledgeBitId, [...claimed.keys()]),
        gte(knowledgeBitFeedback.createdAt, startedAt),
      ),
    )
    .orderBy(desc(knowledgeBitFeedback.createdAt));

  const latest = new Map<string, (typeof rows)[number]>();

  for (const row of rows) {
    if (!latest.has(row.bitId)) {
      latest.set(row.bitId, row);
    }
  }

  const confirmed: ConfirmedDecision[] = [];

  for (const [bitId, claim] of claimed) {
    const row = latest.get(bitId);

    if (row && row.verdict === claim.verdict) {
      confirmed.push({ claim, feedbackId: row.id, modelId: row.modelId });
    }
  }

  return confirmed;
}

export async function countConfirmedDecisions(
  startedAt: Date,
  decisions: TriageDecision[],
  db: DbExecutor = getDb(),
): Promise<ConfirmedTriageCounts> {
  const confirmed = await listConfirmedDecisions(startedAt, decisions, db);

  return {
    accepted: confirmed.filter((item) => item.claim.verdict === "approved").length,
    rejected: confirmed.filter((item) => item.claim.verdict === "rejected").length,
  };
}

async function undoLiveRowsNoLongerApplied(db: DbExecutor, sessionId: string): Promise<void> {
  const live = await db
    .select({ id: cardTriageDecisions.id, bitId: cardTriageDecisions.knowledgeBitId, verdict: cardTriageDecisions.verdict })
    .from(cardTriageDecisions)
    .where(and(eq(cardTriageDecisions.sessionId, sessionId), isNull(cardTriageDecisions.undoneAt)));

  if (live.length === 0) {
    return;
  }

  const states = await db
    .select({ id: knowledgeBits.id, state: knowledgeBits.approvalState })
    .from(knowledgeBits)
    .where(inArray(knowledgeBits.id, live.map((row) => row.bitId)));

  const stateOf = new Map(states.map((row) => [row.id, row.state]));
  const stale = live.filter((row) => stateOf.has(row.bitId) && stateOf.get(row.bitId) !== row.verdict);

  if (stale.length > 0) {
    await db
      .update(cardTriageDecisions)
      .set({ undoneAt: new Date() })
      .where(inArray(cardTriageDecisions.id, stale.map((row) => row.id)));
  }
}

function detailsOf(claim: TriageDecision): DecisionDetails {
  return { note: claim.note, reasonCode: claim.reasonCode, dwellMs: claim.dwellMs };
}

// Brings the session's decision rows in line with what the client claims at finish: backfills
// confirmed claims that have no live row, swaps a live row whose verdict differs, fills a missing
// note, and drops live rows whose card is no longer in that state.
export async function reconcileSessionDecisions(
  tx: DbExecutor,
  session: TriageSessionRow,
  decisions: TriageDecision[],
): Promise<ConfirmedTriageCounts> {
  const confirmed = await listConfirmedDecisions(session.startedAt, decisions, tx);

  for (const item of confirmed) {
    const live = await findLiveDecision(tx, session.id, item.claim.bitId);

    if (live && live.verdict === item.claim.verdict) {
      if (live.note === null && item.claim.note) {
        await tx.update(cardTriageDecisions).set({ note: item.claim.note }).where(eq(cardTriageDecisions.id, live.id));
      }

      continue;
    }

    if (live) {
      await tx.update(cardTriageDecisions).set({ undoneAt: new Date() }).where(eq(cardTriageDecisions.id, live.id));
    }

    await insertDecisionRow(tx, {
      session,
      bitId: item.claim.bitId,
      verdict: item.claim.verdict,
      details: detailsOf(item.claim),
      source: "reconciled",
      context: await loadDecisionContext(tx, item.claim.bitId),
      feedbackId: item.feedbackId,
      fallbackModelId: item.modelId,
    });
  }

  await undoLiveRowsNoLongerApplied(tx, session.id);

  return countLiveDecisions(tx, session.id);
}

export async function countLiveDecisions(db: DbExecutor, sessionId: string): Promise<ConfirmedTriageCounts> {
  const rows = await db
    .select({ verdict: cardTriageDecisions.verdict })
    .from(cardTriageDecisions)
    .where(and(eq(cardTriageDecisions.sessionId, sessionId), isNull(cardTriageDecisions.undoneAt)));

  return {
    accepted: rows.filter((row) => row.verdict === "approved").length,
    rejected: rows.filter((row) => row.verdict === "rejected").length,
  };
}
