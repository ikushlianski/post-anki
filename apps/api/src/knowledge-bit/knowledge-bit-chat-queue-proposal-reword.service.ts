import type { ChatQueueProposal } from "@post-anki/shared";
import { getDb } from "../db/client.js";
import { runKnowledgeBitChatReword } from "../mastra/knowledge-bit-chat-reword.agent.js";
import { log } from "../shared/log.js";
import { LlmBudgetCheckUnavailableError, LlmBudgetExceededError } from "../shared/spend-guard.js";
import { getAssistantProposals, saveAssistantProposals } from "./knowledge-bit-chat-queue-messages.repo.js";
import { validateChatQueueProposal } from "./knowledge-bit-chat-queue-proposal-validation.js";
import { lockChatState } from "./knowledge-bit-chat-queue.repo.js";

export type ProposalRewordFailure =
  | "not_found"
  | "not_in_chat"
  | "proposal_not_pending"
  | "generation_failed"
  | "budget_exceeded";

export type ProposalRewordResult =
  | { ok: true; proposal: ChatQueueProposal }
  | { ok: false; error: ProposalRewordFailure };

type Read = { ok: true; proposal: ChatQueueProposal } | { ok: false; error: ProposalRewordFailure };

async function readPending(bitId: string, seq: number, index: number): Promise<Read> {
  return getDb().transaction(async (tx): Promise<Read> => {
    const state = await lockChatState(tx, bitId);

    if (state === null) {
      return { ok: false, error: "not_found" };
    }

    if (state !== "chat" && state !== "approved") {
      return { ok: false, error: "not_in_chat" };
    }

    const proposal = (await getAssistantProposals(bitId, seq, tx))?.find((entry) => entry.index === index);

    if (!proposal) {
      return { ok: false, error: "not_found" };
    }

    return proposal.status === "pending" ? { ok: true, proposal } : { ok: false, error: "proposal_not_pending" };
  });
}

function problemWith(next: string, current: ChatQueueProposal): string | null {
  if (next.trim().toLowerCase() === current.front.trim().toLowerCase()) {
    return "The new front is the same as the old one. Use clearly different wording.";
  }

  return validateChatQueueProposal({ front: next, back: current.back }, "");
}

async function generateFront(current: ChatQueueProposal): Promise<string | null> {
  let feedback: string | undefined;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { front } = await runKnowledgeBitChatReword(current.front, current.back, feedback);
    const problem = problemWith(front, current);

    if (!problem) {
      return front;
    }

    feedback = problem;
  }

  return null;
}

export async function rewordChatQueueProposal(
  bitId: string,
  seq: number,
  index: number,
): Promise<ProposalRewordResult> {
  const read = await readPending(bitId, seq, index);

  if (!read.ok) {
    return read;
  }

  let front: string | null;

  try {
    front = await generateFront(read.proposal);
  } catch (err) {
    if (err instanceof LlmBudgetExceededError || err instanceof LlmBudgetCheckUnavailableError) {
      return { ok: false, error: "budget_exceeded" };
    }

    log.error({ err, id: bitId }, "chat_proposal_reword_failed");

    return { ok: false, error: "generation_failed" };
  }

  if (front === null) {
    return { ok: false, error: "generation_failed" };
  }

  return getDb().transaction(async (tx): Promise<ProposalRewordResult> => {
    const proposals = await getAssistantProposals(bitId, seq, tx);
    const latest = proposals?.find((entry) => entry.index === index);

    if (!proposals || !latest) {
      return { ok: false, error: "not_found" };
    }

    if (latest.status !== "pending") {
      return { ok: false, error: "proposal_not_pending" };
    }

    const proposal = { ...latest, front };

    await saveAssistantProposals(
      bitId,
      seq,
      proposals.map((entry) => (entry.index === index ? proposal : entry)),
      tx,
    );

    return { ok: true, proposal };
  });
}
