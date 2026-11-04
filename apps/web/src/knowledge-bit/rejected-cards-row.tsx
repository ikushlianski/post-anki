import { KNOWLEDGE_BIT_REJECT_REASON_LABELS } from "@post-anki/shared";

import { safeHref } from "../shared/safe-href";
import { RejectedCardNote } from "./rejected-card-note";
import type { RejectedCardsOutcome } from "./rejected-knowledge-bits.api";
import type { useRejectedSendToChat } from "./use-rejected-send-to-chat";

type RejectedPage = Extract<RejectedCardsOutcome, { ok: true }>;
type RejectedCard = RejectedPage["items"][number];

interface RejectedCardsRowProps {
  card: RejectedCard;
  selected: boolean;
  restoring: boolean;
  restoreFailed: boolean;
  chat: ReturnType<typeof useRejectedSendToChat>;
  onToggleSelected: (id: string) => void;
  onRestore: (id: string) => Promise<void>;
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function RejectedCardsRow({
  card,
  selected,
  restoring,
  restoreFailed,
  chat,
  onToggleSelected,
  onRestore,
}: RejectedCardsRowProps) {
  return (
    <li
      data-testid={`rejected-card-row-${card.knowledgeBitId}`}
      className="rounded-lg border border-neutral-200 bg-white p-4"
    >
      <div className="flex items-start gap-3">
        <label className="flex min-h-[44px] min-w-[44px] items-center justify-center sm:min-h-0 sm:min-w-0">
          <input
            type="checkbox"
            data-testid={`rejected-card-select-${card.knowledgeBitId}`}
            aria-label="Select card"
            className="sm:mt-1"
            checked={selected}
            disabled={restoring}
            onChange={() => onToggleSelected(card.knowledgeBitId)}
          />
        </label>
        <div className="min-w-0">
          <p className="text-sm text-neutral-900">{card.body}</p>
          {card.sourceTitle ? (
            <p
              data-testid={`rejected-card-source-${card.knowledgeBitId}`}
              className="mt-1 truncate text-xs text-neutral-500"
            >
              {safeHref(card.sourceUrl) ? (
                <a
                  href={safeHref(card.sourceUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-600 hover:underline"
                >
                  {card.sourceTitle}
                </a>
              ) : (
                card.sourceTitle
              )}
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-neutral-500">
            <span data-testid={`rejected-card-reason-${card.knowledgeBitId}`}>
              {KNOWLEDGE_BIT_REJECT_REASON_LABELS[card.reasonCode]}
            </span>
            {" · "}
            {formatDay(card.decidedAt)}
          </p>
          {card.note?.trim() ? (
            <RejectedCardNote id={card.knowledgeBitId} note={card.note} />
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid={`rejected-card-restore-${card.knowledgeBitId}`}
            disabled={restoring || chat.sendingIds.has(card.knowledgeBitId)}
            onClick={() => void onRestore(card.knowledgeBitId)}
            className="rounded-md border border-neutral-200 px-3 py-1 text-xs font-medium text-neutral-800 hover:bg-neutral-100 disabled:opacity-50 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0"
          >
            Restore
          </button>
          <button
            type="button"
            data-testid={`rejected-card-send-chat-${card.knowledgeBitId}`}
            disabled={restoring || chat.sendingIds.has(card.knowledgeBitId)}
            onClick={() =>
              void chat.sendToChat(card.knowledgeBitId, card.reasonCode)
            }
            className="rounded-md border border-neutral-200 px-3 py-1 text-xs font-medium text-neutral-800 hover:bg-neutral-100 disabled:opacity-50 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0"
          >
            Send to Chat
          </button>
        </div>
      </div>
      {chat.chatFailedIds.has(card.knowledgeBitId) ? (
        <p
          role="alert"
          data-testid={`rejected-card-chat-error-${card.knowledgeBitId}`}
          className="mt-2 text-xs text-red-600"
        >
          Could not send this card to Chat. Try again.
        </p>
      ) : null}
      {restoreFailed ? (
        <p
          role="alert"
          data-testid={`rejected-card-restore-error-${card.knowledgeBitId}`}
          className="mt-2 text-xs text-red-600"
        >
          Could not restore this card. Try again.
        </p>
      ) : null}
    </li>
  );
}
