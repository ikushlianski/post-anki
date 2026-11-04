import {
  KNOWLEDGE_BIT_ALL_REJECT_REASONS,
  rejectReasonCodesForSubjectType,
  type KnowledgeBitRejectReason,
  type TriageHistoryItem,
  type TriageHistoryQuery,
  type TriageHistoryResponse,
} from "@post-anki/shared";
import { embedTexts } from "../shared/embeddings-client.js";
import { log } from "../shared/log.js";
import { loadSubjectKindRows, pickRejectSubjectType } from "../subject/reject-subject-type.js";
import { listRecentTriageDecisions, type TriageHistoryRow } from "./card-triage-history.repo.js";
import {
  cosineSimilarity,
  historyRowText,
  MEANING_EMBED_CAP,
  rankHistoryRows,
  type RankedHistoryRow,
} from "./triage-history-ranking.js";

const DAY_MS = 86_400_000;

function reasonOf(code: string | null): KnowledgeBitRejectReason | null {
  return KNOWLEDGE_BIT_ALL_REJECT_REASONS.find((reason) => reason === code) ?? null;
}

async function similaritiesFor(rows: TriageHistoryRow[], query: string): Promise<Map<string, number> | null> {
  try {
    const [embedded] = await embedTexts([{ id: "query", text: query }]);

    if (!embedded) {
      return null;
    }

    const similarities = new Map<string, number>();
    const missing: TriageHistoryRow[] = [];

    for (const row of rows) {
      if (row.bitVector) {
        similarities.set(row.id, cosineSimilarity(embedded.embedding, row.bitVector));
      } else if (historyRowText(row)) {
        missing.push(row);
      }
    }

    const items = missing.slice(0, MEANING_EMBED_CAP).map((row) => ({ id: row.id, text: historyRowText(row) }));
    const vectors = await embedTexts(items).catch((err: unknown) => {
      log.warn({ err }, "triage_history_row_embedding_failed");

      return [];
    });

    for (const vector of vectors) {
      similarities.set(vector.id, cosineSimilarity(embedded.embedding, vector.embedding));
    }

    return similarities;
  } catch (err) {
    log.warn({ err }, "triage_history_query_embedding_failed");

    return null;
  }
}

export async function getRecentTriageHistory(
  query: TriageHistoryQuery,
  now: Date = new Date(),
): Promise<TriageHistoryResponse> {
  const rows = await listRecentTriageDecisions(new Date(now.getTime() - query.days * DAY_MS), query.q);
  const wantsMeaning = query.q !== "" && query.mode !== "text";
  const similarities = wantsMeaning ? await similaritiesFor(rows, query.q) : null;
  const meaningUnavailable = wantsMeaning && similarities === null;
  const useText = query.mode !== "meaning" || meaningUnavailable;
  const kindRows = await loadSubjectKindRows();
  const ranked = rankHistoryRows(rows, { query: query.q, useText, similarities });

  return {
    days: query.days,
    mode: meaningUnavailable ? "text" : query.mode,
    meaningUnavailable,
    decisions: ranked.map((item) => toHistoryItem(item, kindRows)),
  };
}

function toHistoryItem(item: RankedHistoryRow, kindRows: Awaited<ReturnType<typeof loadSubjectKindRows>>): TriageHistoryItem {
  const { row } = item;
  const subjectType = pickRejectSubjectType(row.subjectId, kindRows);

  return {
    id: row.id,
    sessionId: row.sessionId,
    bitId: row.bitId,
    verdict: row.verdict === "rejected" ? "rejected" : "approved",
    reasonCode: reasonOf(row.reasonCode),
    note: row.note,
    decidedAt: row.decidedAt.toISOString(),
    front: row.front ?? row.bitBody,
    back: row.back,
    subjectType,
    rejectReasonCodes: [...rejectReasonCodesForSubjectType(subjectType)],
    extractionModelId: row.extractionModelId,
    fusionModelIds: row.fusionModelIds ?? [],
    score: item.score,
    matchedBy: item.matchedBy,
  };
}
