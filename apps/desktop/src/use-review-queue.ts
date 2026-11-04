import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  getDueCards,
  getReviewDueCounts,
  syncPendingGrades,
  type ReviewCard,
  type ReviewCounts,
  type ReviewScope,
  type SubjectDueCounts,
} from "@/api/review-commands";
import { errorMessage } from "@/shared/error-message";
import { mergeIncoming, needsRefill, SYNC_RETRY_MS } from "@/review-queue";

export type ReviewPhase = "loading" | "ready" | "error";

export interface ReviewQueue {
  phase: ReviewPhase;
  cards: ReviewCard[];
  card: ReviewCard | null;
  index: number;
  setIndex: Dispatch<SetStateAction<number>>;
  revealed: boolean;
  setRevealed: Dispatch<SetStateAction<boolean>>;
  counts: ReviewCounts | null;
  setCounts: Dispatch<SetStateAction<ReviewCounts | null>>;
  dueCounts: SubjectDueCounts | null;
  exhausted: boolean;
  refilling: boolean;
  offline: boolean;
  pending: number;
  setPending: Dispatch<SetStateAction<number>>;
  error: string | null;
  setError: Dispatch<SetStateAction<string | null>>;
  cardsRef: { readonly current: ReviewCard[] };
  commitCards: (next: ReviewCard[]) => void;
  loadCards: (next: ReviewScope) => Promise<void>;
}

export function useReviewQueue(scope: ReviewScope): ReviewQueue {
  const { subjectId, aheadDays } = scope;
  const [phase, setPhase] = useState<ReviewPhase>("loading");
  const [cards, setCards] = useState<ReviewCard[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [counts, setCounts] = useState<ReviewCounts | null>(null);
  const [dueCounts, setDueCounts] = useState<SubjectDueCounts | null>(null);
  const [refilling, setRefilling] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [offline, setOffline] = useState(false);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const cardsRef = useRef<ReviewCard[]>([]);
  const requestSeq = useRef(0);

  const commitCards = useCallback((next: ReviewCard[]) => {
    cardsRef.current = next;
    setCards(next);
  }, []);

  const loadCards = useCallback(
    async (next: ReviewScope) => {
      const seq = ++requestSeq.current;

      setPhase("loading");
      setError(null);
      setExhausted(false);

      try {
        const batch = await getDueCards(next);

        if (seq !== requestSeq.current) {
          return;
        }

        commitCards(batch.cards);
        setOffline(batch.offline);
        setPending(batch.pending);
        if (batch.counts) {
          setCounts(batch.counts);
        }
        setIndex(0);
        setRevealed(false);
        setPhase("ready");
      } catch (reason) {
        if (seq !== requestSeq.current) {
          return;
        }

        setError(errorMessage(reason, "Could not load due cards."));
        setPhase("error");
      }
    },
    [commitCards],
  );

  const refill = useCallback(
    async (next: ReviewScope) => {
      const seq = requestSeq.current;

      setRefilling(true);

      try {
        const batch = await getDueCards(next);

        if (seq !== requestSeq.current) {
          return;
        }

        const held = cardsRef.current;
        const merged = mergeIncoming(held, batch.cards);

        commitCards(merged);
        setExhausted(merged.length === held.length);
        setOffline(batch.offline);
        setPending(batch.pending);
        if (batch.counts) {
          setCounts(batch.counts);
        }
      } catch (reason) {
        if (seq === requestSeq.current) {
          setError(errorMessage(reason, "Could not load more cards."));
          setExhausted(true);
        }
      } finally {
        setRefilling(false);
      }
    },
    [commitCards],
  );

  useEffect(() => {
    commitCards([]);
    setCounts(null);
    void loadCards({ subjectId, aheadDays });
    getReviewDueCounts()
      .then(setDueCounts)
      .catch(() => setDueCounts(null));
  }, [subjectId, aheadDays, loadCards, commitCards]);

  useEffect(() => {
    if (phase !== "ready" || !needsRefill(cards.length - index - 1, refilling, exhausted)) {
      return;
    }

    void refill({ subjectId, aheadDays });
  }, [phase, cards.length, index, refilling, exhausted, refill, subjectId, aheadDays]);

  useEffect(() => {
    function syncOnFocus() {
      syncPendingGrades()
        .then((status) => setPending(status.pending))
        .catch(() => undefined);
    }

    window.addEventListener("focus", syncOnFocus);

    return () => window.removeEventListener("focus", syncOnFocus);
  }, []);

  useEffect(() => {
    if (pending === 0) {
      return;
    }

    const timer = window.setInterval(() => {
      syncPendingGrades()
        .then((status) => setPending(status.pending))
        .catch(() => undefined);
    }, SYNC_RETRY_MS);

    return () => window.clearInterval(timer);
  }, [pending]);

  return {
    phase,
    cards,
    card: cards[index] ?? null,
    index,
    setIndex,
    revealed,
    setRevealed,
    counts,
    setCounts,
    dueCounts,
    exhausted,
    refilling,
    offline,
    pending,
    setPending,
    error,
    setError,
    cardsRef,
    commitCards,
    loadCards,
  };
}
