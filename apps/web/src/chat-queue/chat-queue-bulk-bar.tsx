import { useState } from "react";

import { SECONDARY_BUTTON_CLASS } from "../knowledge-bit/knowledge-bit-review-classes";
import { BULK_CONFIRM_THRESHOLD } from "./use-chat-queue-bulk";

type Props = {
  count: number;
  moving: boolean;
  failedCount: number;
  onMove: () => void;
  onClear: () => void;
};

export function ChatQueueBulkBar({
  count,
  moving,
  failedCount,
  onMove,
  onClear,
}: Props) {
  const [confirming, setConfirming] = useState(false);
  const needsConfirm = count > BULK_CONFIRM_THRESHOLD;

  function startMove() {
    if (needsConfirm && !confirming) {
      setConfirming(true);

      return;
    }

    setConfirming(false);
    onMove();
  }

  return (
    <div
      data-testid="chat-queue-bulk-bar"
      className="mb-3 space-y-1 rounded-lg border border-neutral-300 bg-neutral-50 p-3 text-sm"
    >
      <div className="flex flex-wrap items-center gap-3">
        <span data-testid="chat-queue-bulk-count">{count} selected</span>
        {confirming ? (
          <>
            <span data-testid="chat-queue-bulk-confirm-text">
              Move {count} cards to Inbox?
            </span>
            <button
              type="button"
              data-testid="chat-queue-bulk-confirm"
              onClick={startMove}
              className={SECONDARY_BUTTON_CLASS}
            >
              Confirm
            </button>
            <button
              type="button"
              data-testid="chat-queue-bulk-cancel"
              onClick={() => setConfirming(false)}
              className={SECONDARY_BUTTON_CLASS}
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            data-testid="chat-queue-bulk-move"
            disabled={moving || count === 0}
            onClick={startMove}
            className={SECONDARY_BUTTON_CLASS}
          >
            {moving ? "Moving…" : "Move to Inbox"}
          </button>
        )}
        <button
          type="button"
          data-testid="chat-queue-bulk-clear"
          disabled={moving}
          onClick={() => {
            setConfirming(false);
            onClear();
          }}
          className={SECONDARY_BUTTON_CLASS}
        >
          Clear
        </button>
      </div>
      {failedCount > 0 ? (
        <p
          role="alert"
          data-testid="chat-queue-bulk-error"
          className="text-red-700"
        >
          {failedCount} {failedCount === 1 ? "card" : "cards"} could not be
          moved and stay selected.
        </p>
      ) : null}
    </div>
  );
}
