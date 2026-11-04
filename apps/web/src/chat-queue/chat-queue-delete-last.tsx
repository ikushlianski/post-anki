import { SECONDARY_BUTTON_CLASS, TEXT_BUTTON_CLASS } from "../knowledge-bit/knowledge-bit-review-classes";
import type { useChatDeleteLast } from "./use-chat-delete-last";

interface Props {
  removal: ReturnType<typeof useChatDeleteLast>;
  disabled: boolean;
}

export function ChatQueueDeleteLast({ removal, disabled }: Props) {
  const blocked = disabled || removal.deleting;

  if (!removal.confirming) {
    return (
      <button
        type="button"
        data-testid="chat-queue-delete-last"
        disabled={blocked}
        onClick={removal.ask}
        className={TEXT_BUTTON_CLASS}
      >
        Delete last exchange
      </button>
    );
  }

  return (
    <div data-testid="chat-queue-delete-last-confirm" className="flex flex-wrap items-center gap-2">
      <p className="text-xs text-neutral-500">Delete your last message and the reply? You get the question back.</p>
      <button
        type="button"
        data-testid="chat-queue-delete-last-yes"
        disabled={blocked}
        onClick={() => void removal.confirm()}
        className={SECONDARY_BUTTON_CLASS}
      >
        Delete
      </button>
      <button
        type="button"
        data-testid="chat-queue-delete-last-cancel"
        disabled={removal.deleting}
        onClick={removal.cancel}
        className={TEXT_BUTTON_CLASS}
      >
        Keep
      </button>
    </div>
  );
}
