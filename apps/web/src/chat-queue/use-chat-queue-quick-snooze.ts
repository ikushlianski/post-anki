import { useCallback, useRef, useState } from "react";
import { CHAT_QUEUE_SNOOZE_OPTIONS_DAYS } from "@post-anki/shared";

import { snoozeChatQueueCard } from "./chat-queue.api";

export const CHAT_QUEUE_QUICK_SNOOZE_DAYS = CHAT_QUEUE_SNOOZE_OPTIONS_DAYS[0];
export const CHAT_QUEUE_SNOOZE_ERROR = "Could not snooze this card. Try again.";

export function useChatQueueQuickSnooze(
  onSnoozed: (id: string, snoozedUntil: string) => void,
) {
  const runningRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const snooze = useCallback(
    async (id: string) => {
      if (runningRef.current) return;

      runningRef.current = true;
      setError(null);

      try {
        const outcome = await snoozeChatQueueCard({
          data: { bitId: id, days: CHAT_QUEUE_QUICK_SNOOZE_DAYS },
        });

        if (outcome.ok && outcome.data.snoozedUntil) {
          onSnoozed(id, outcome.data.snoozedUntil);
        } else {
          setError(CHAT_QUEUE_SNOOZE_ERROR);
        }
      } catch {
        setError(CHAT_QUEUE_SNOOZE_ERROR);
      } finally {
        runningRef.current = false;
      }
    },
    [onSnoozed],
  );

  return { snooze, error, clearError };
}
