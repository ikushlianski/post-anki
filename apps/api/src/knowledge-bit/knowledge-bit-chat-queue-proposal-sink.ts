import { CHAT_QUEUE_MAX_PROPOSALS, type ChatQueueProposal } from "@post-anki/shared";

export type NewChatQueueProposal = Pick<ChatQueueProposal, "kind" | "front" | "back" | "example" | "reason">;

export type ProposalSinkResult = { ok: true; index: number } | { ok: false; error: string };

export interface ChatQueueProposalSink {
  add(input: NewChatQueueProposal): ProposalSinkResult;
  list(): ChatQueueProposal[];
}

function normalized(front: string, back: string): string {
  return `${front}\n${back}`.toLowerCase().replace(/\s+/g, " ").trim();
}

export function createChatQueueProposalSink(existing: ChatQueueProposal[] = []): ChatQueueProposalSink {
  const proposals: ChatQueueProposal[] = [];
  const known = new Set(
    existing.filter((entry) => entry.status !== "rejected").map((entry) => normalized(entry.front, entry.back)),
  );

  return {
    add(input) {
      if (proposals.length >= CHAT_QUEUE_MAX_PROPOSALS) {
        return {
          ok: false,
          error: `Limit of ${CHAT_QUEUE_MAX_PROPOSALS} proposals reached for this reply. Describe any further changes in text.`,
        };
      }

      const key = normalized(input.front, input.back);

      if (known.has(key)) {
        return {
          ok: false,
          error: "An identical card is already proposed or accepted in this conversation. Propose something different or reply in text.",
        };
      }

      known.add(key);

      const index = proposals.length;

      proposals.push({
        index,
        kind: input.kind,
        front: input.front,
        back: input.back,
        ...(input.example ? { example: input.example } : {}),
        ...(input.reason ? { reason: input.reason } : {}),
        status: "pending",
      });

      return { ok: true, index };
    },
    list: () => proposals.map((entry) => ({ ...entry })),
  };
}
