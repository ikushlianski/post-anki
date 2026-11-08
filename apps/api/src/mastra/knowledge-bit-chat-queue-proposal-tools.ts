import { z } from "zod";
import { createTool } from "@mastra/core/tools";
import {
  CHAT_QUEUE_PROPOSAL_REASON_MAX_CHARS,
  MANUAL_ITEM_BACK_MAX_CHARS,
  MANUAL_ITEM_EXAMPLE_MAX_CHARS,
  MANUAL_ITEM_FRONT_MAX_CHARS,
} from "@post-anki/shared";
import type { ChatQueueProposalSink } from "../knowledge-bit/knowledge-bit-chat-queue-proposal-sink.js";

export interface ChatQueueProposalToolsDeps {
  sink: ChatQueueProposalSink;
  allowUpdate: boolean;
}

export const proposalToolInputSchema = z
  .object({
    front: z.string().trim().min(1).max(MANUAL_ITEM_FRONT_MAX_CHARS),
    back: z.string().trim().min(1).max(MANUAL_ITEM_BACK_MAX_CHARS),
    example: z.string().trim().min(1).max(MANUAL_ITEM_EXAMPLE_MAX_CHARS).optional(),
    reason: z.string().trim().min(1).max(CHAT_QUEUE_PROPOSAL_REASON_MAX_CHARS).optional(),
  })
  .strict();

const SAVED_NOTE =
  "Proposal recorded and shown to the learner, NOT saved. The learner must accept it; never tell them it is saved.";

export function createChatQueueProposalTools(deps: ChatQueueProposalToolsDeps) {
  const propose = (kind: "create" | "update") => (input: z.infer<typeof proposalToolInputSchema>) => {
    const outcome = deps.sink.add({ kind, ...input });

    return outcome.ok ? { ok: true as const, note: SAVED_NOTE } : { ok: false as const, error: outcome.error };
  };

  const proposeNewCard = createTool({
    id: "proposeNewCard",
    description:
      "Propose one additional flashcard for the learner to accept or reject. It is only shown, never saved. Max 2 proposals per reply. front is a short question, back a concise answer, example optional, reason (one short sentence) optional.",
    inputSchema: proposalToolInputSchema,
    execute: async (input) => propose("create")(input),
  });

  if (!deps.allowUpdate) {
    return { proposeNewCard };
  }

  const proposeCardUpdate = createTool({
    id: "proposeCardUpdate",
    description:
      "Propose a rewrite of THIS conversation's card (new front, back, optional example) for the learner to accept or reject. It is only shown, never saved. Counts toward the 2 proposals per reply.",
    inputSchema: proposalToolInputSchema,
    execute: async (input) => propose("update")(input),
  });

  return { proposeNewCard, proposeCardUpdate };
}
