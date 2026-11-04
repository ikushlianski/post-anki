import { useCallback, useRef, useState } from "react";

import { returnFromChatQueue } from "./chat-queue.api";

export const BULK_CONFIRM_THRESHOLD = 5;
const BULK_CONCURRENCY = 3;

async function moveOne(id: string): Promise<boolean> {
  try {
    const outcome = await returnFromChatQueue({ data: { bitId: id } });

    return outcome.ok;
  } catch {
    return false;
  }
}

export async function moveCardsToInbox(
  ids: readonly string[],
): Promise<{ moved: string[]; failed: string[] }> {
  const moved: string[] = [];
  const failed: string[] = [];
  let next = 0;

  async function worker() {
    while (next < ids.length) {
      const id = ids[next];

      next += 1;

      if (await moveOne(id)) moved.push(id);
      else failed.push(id);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(BULK_CONCURRENCY, ids.length) }, worker),
  );

  return { moved, failed };
}

export function useChatQueueBulk(onMoved: (ids: string[]) => void) {
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [moving, setMoving] = useState(false);
  const [failedCount, setFailedCount] = useState(0);

  const movingRef = useRef(false);

  const toggle = useCallback((id: string) => {
    if (movingRef.current) return;

    setPicked((prev) => {
      const next = new Set(prev);

      if (next.has(id)) next.delete(id);
      else next.add(id);

      return next;
    });
  }, []);

  const pickAll = useCallback((ids: readonly string[]) => {
    setPicked(new Set(ids));
  }, []);

  const prune = useCallback((liveIds: readonly string[]) => {
    setPicked((prev) => {
      const live = new Set(liveIds);
      const kept = [...prev].filter((id) => live.has(id));

      return kept.length === prev.size ? prev : new Set(kept);
    });
  }, []);

  const drop = useCallback((id: string) => {
    setPicked((prev) => {
      if (!prev.has(id)) return prev;

      const next = new Set(prev);

      next.delete(id);

      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setPicked(new Set());
    setFailedCount(0);
  }, []);

  const move = useCallback(
    async (ids: readonly string[]) => {
      if (movingRef.current || ids.length === 0) return;

      movingRef.current = true;
      setMoving(true);
      setFailedCount(0);

      const { moved, failed } = await moveCardsToInbox(ids);

      setPicked(new Set(failed));
      setFailedCount(failed.length);
      movingRef.current = false;
      setMoving(false);

      if (moved.length > 0) onMoved(moved);
    },
    [onMoved],
  );

  const moveSingle = useCallback(
    async (id: string) => {
      if (movingRef.current) return;

      movingRef.current = true;
      setMoving(true);

      const { moved } = await moveCardsToInbox([id]);

      if (moved.length > 0) {
        setPicked((prev) => {
          if (!prev.has(id)) return prev;

          const next = new Set(prev);

          next.delete(id);

          return next;
        });
      }

      movingRef.current = false;
      setMoving(false);

      if (moved.length > 0) onMoved(moved);
    },
    [onMoved],
  );

  return {
    picked,
    moving,
    failedCount,
    toggle,
    pickAll,
    prune,
    drop,
    clear,
    move,
    moveSingle,
  };
}
