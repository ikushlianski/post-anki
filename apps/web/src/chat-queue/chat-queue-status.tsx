import { SECONDARY_BUTTON_CLASS } from "../knowledge-bit/knowledge-bit-review-classes";
import type { ChatQueueState } from "./use-chat-queue";

interface ChatQueueStatusProps {
  state: ChatQueueState;
  onRetry: () => void;
}

export function ChatQueueStatus({ state, onRetry }: ChatQueueStatusProps) {
  if (state.status === "loading") {
    return (
      <p
        role="status"
        aria-live="polite"
        data-testid="chat-queue-loading"
        className="text-sm text-neutral-500"
      >
        Loading…
      </p>
    );
  }

  if (state.status === "error") {
    return (
      <div
        role="alert"
        data-testid="chat-queue-load-error"
        className="space-y-2 text-sm text-red-700"
      >
        <p>{state.message}</p>
        <button
          type="button"
          onClick={onRetry}
          className={SECONDARY_BUTTON_CLASS}
        >
          Try again
        </button>
      </div>
    );
  }

  if (state.items.length === 0) {
    return (
      <p
        role="status"
        aria-live="polite"
        data-testid="chat-queue-empty"
        className="text-sm text-neutral-600"
      >
        Chat is empty. While triaging, send a card to Chat to ask the tutor
        about it before you decide.
      </p>
    );
  }

  return null;
}
