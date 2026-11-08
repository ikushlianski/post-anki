import type { ChatQueueProposal, ChatQueueProposalDecisionResult } from "@post-anki/shared";
import { getDb } from "../db/client.js";
import { log } from "../shared/log.js";
import { embedApprovedKnowledgeBits } from "./knowledge-bit-approval-embedding.orchestrator.js";
import { applyChatCardRevision, getChatCardSourceId, insertApprovedChatCard } from "./knowledge-bit-chat-card.repo.js";
import { getAssistantProposals, saveAssistantProposals } from "./knowledge-bit-chat-queue-messages.repo.js";
import { lockChatState } from "./knowledge-bit-chat-queue.repo.js";

export type ProposalDecision = "accept" | "reject";

export type ProposalDecisionFailure =
  | "not_found"
  | "not_in_chat"
  | "proposal_not_pending"
  | "wrong_shape";

export type ProposalDecisionResult =
  | { ok: true; value: ChatQueueProposalDecisionResult }
  | { ok: false; error: ProposalDecisionFailure };

type TxOutcome = ProposalDecisionResult & { embedId?: string };

const TARGET_STATUS = { accept: "accepted", reject: "rejected" } as const;

function withStatus(
  proposals: ChatQueueProposal[],
  index: number,
  status: ChatQueueProposal["status"],
  savedCardId?: string,
): ChatQueueProposal[] {
  return proposals.map((entry) =>
    entry.index === index ? { ...entry, status, ...(savedCardId ? { savedCardId } : {}) } : entry,
  );
}

export async function decideChatQueueProposal(
  bitId: string,
  seq: number,
  index: number,
  decision: ProposalDecision,
): Promise<ProposalDecisionResult> {
  const target = TARGET_STATUS[decision];

  const outcome = await getDb().transaction(async (tx): Promise<TxOutcome> => {
    const state = await lockChatState(tx, bitId);

    if (state === null) {
      return { ok: false, error: "not_found" };
    }

    if (state !== "chat" && state !== "approved") {
      return { ok: false, error: "not_in_chat" };
    }

    const proposals = await getAssistantProposals(bitId, seq, tx);
    const proposal = proposals?.find((entry) => entry.index === index);

    if (!proposals || !proposal) {
      return { ok: false, error: "not_found" };
    }

    if (proposal.status === target) {
      return {
        ok: true,
        value: { ok: true, status: target, ...(proposal.savedCardId ? { savedCardId: proposal.savedCardId } : {}) },
      };
    }

    if (proposal.status !== "pending") {
      return { ok: false, error: "proposal_not_pending" };
    }

    if (decision === "reject") {
      await saveAssistantProposals(bitId, seq, withStatus(proposals, index, "rejected"), tx);

      return { ok: true, value: { ok: true, status: "rejected" } };
    }

    const content = { front: proposal.front, back: proposal.back, example: proposal.example };
    let savedCardId = bitId;
    let embedId: string | undefined;

    if (proposal.kind === "update") {
      if (state !== "chat") {
        return { ok: false, error: "not_in_chat" };
      }

      const revised = await applyChatCardRevision(tx, bitId, content);

      if (!revised.ok) {
        return { ok: false, error: revised.error };
      }
    } else {
      const sourceId = await getChatCardSourceId(tx, bitId);

      if (!sourceId) {
        return { ok: false, error: "not_found" };
      }

      const saved = await insertApprovedChatCard(tx, sourceId, content);

      savedCardId = saved.id;
      embedId = saved.created ? saved.id : undefined;
    }

    await saveAssistantProposals(bitId, seq, withStatus(proposals, index, "accepted", savedCardId), tx);

    return { ok: true, value: { ok: true, status: "accepted", savedCardId }, embedId };
  });

  if (outcome.ok && outcome.embedId) {
    try {
      await embedApprovedKnowledgeBits([outcome.embedId]);
    } catch (err) {
      log.warn({ err, id: outcome.embedId }, "chat_proposal_embed_failed");
    }
  }

  return outcome.ok ? { ok: true, value: outcome.value } : outcome;
}
