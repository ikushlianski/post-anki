import { SECONDARY_BUTTON_CLASS } from "../knowledge-bit/knowledge-bit-review-classes";

export function ChatQueueNoMatches({ onClear }: { onClear: () => void }) {
  return (
    <div
      data-testid="chat-queue-no-matches"
      className="space-y-2 text-sm text-neutral-600"
    >
      <p>No cards match your search.</p>
      <button
        type="button"
        data-testid="chat-queue-clear-filters"
        onClick={onClear}
        className={SECONDARY_BUTTON_CLASS}
      >
        Clear filters
      </button>
    </div>
  );
}
