import type http from "node:http";
import { sendError, sendJson } from "../shared/http.js";
import {
  decideChatQueueProposal,
  type ProposalDecision,
  type ProposalDecisionFailure,
} from "./knowledge-bit-chat-queue-proposal.service.js";

const STATUS: Record<ProposalDecisionFailure, number> = {
  not_found: 404,
  not_in_chat: 409,
  proposal_not_pending: 409,
  wrong_shape: 422,
};

function parseNonNegative(value: string, min: number): number | null {
  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed >= min ? parsed : null;
}

async function handleDecision(
  res: http.ServerResponse,
  id: string,
  seq: string,
  index: string,
  decision: ProposalDecision,
): Promise<void> {
  const seqNumber = parseNonNegative(seq, 1);
  const indexNumber = parseNonNegative(index, 0);

  if (seqNumber === null || indexNumber === null) {
    sendError(res, 404, "not_found");
    return;
  }

  const result = await decideChatQueueProposal(id, seqNumber, indexNumber, decision);

  if (!result.ok) {
    sendError(res, STATUS[result.error], result.error);
    return;
  }

  sendJson(res, 200, result.value);
}

// POST /knowledge-bits/:id/chat-messages/:seq/proposals/:index/accept
export function handleAcceptChatQueueProposal(
  res: http.ServerResponse,
  id: string,
  seq: string,
  index: string,
): Promise<void> {
  return handleDecision(res, id, seq, index, "accept");
}

// POST /knowledge-bits/:id/chat-messages/:seq/proposals/:index/reject
export function handleRejectChatQueueProposal(
  res: http.ServerResponse,
  id: string,
  seq: string,
  index: string,
): Promise<void> {
  return handleDecision(res, id, seq, index, "reject");
}
