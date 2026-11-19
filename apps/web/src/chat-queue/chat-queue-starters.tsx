import { CHAT_QUEUE_STARTER_PROMPTS } from "@post-anki/shared";

import { SECONDARY_BUTTON_CLASS } from "../knowledge-bit/knowledge-bit-review-classes";

export function ChatQueueStarters({
  locked,
  onPick,
}: {
  locked: boolean;
  onPick: (prompt: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" data-testid="chat-queue-starters">
      {CHAT_QUEUE_STARTER_PROMPTS.map((prompt) => (
        <button
          key={prompt}
          type="button"
          disabled={locked}
          onClick={() => onPick(prompt)}
          className={SECONDARY_BUTTON_CLASS}
        >
          {prompt}
        </button>
      ))}
    </div>
  );
}
