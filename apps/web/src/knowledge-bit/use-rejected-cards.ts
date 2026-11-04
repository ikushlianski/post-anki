import {
  useInfiniteQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { KnowledgeBitFeedbackReason } from "@post-anki/shared";

import { notifyPendingReviewChanged } from "./knowledge-bit-review-events";
import { runWithConcurrency } from "./run-with-concurrency";
import {
  restoreRejectedKnowledgeBit,
  listRejectedKnowledgeBits,
  type RejectedCardsOutcome,
  type RestoreRejectedOutcome,
} from "./rejected-knowledge-bits.api";
import { uniqueById } from "../shared/unique-by-id";

const PAGE_SIZE = 50;
const BULK_RESTORE_CONCURRENCY = 3;

type RejectedPage = Extract<RejectedCardsOutcome, { ok: true }>;

function without(set: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(set);

  next.delete(id);

  return next;
}

interface UseRejectedCardsParams {
  reason: KnowledgeBitFeedbackReason | undefined;
  subjectId: string | undefined;
  q: string | undefined;
}

export function useRejectedCards({ reason, subjectId, q }: UseRejectedCardsParams) {
  const queryClient = useQueryClient();
  const [restoringIds, setRestoringIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [staleNotice, setStaleNotice] = useState(false);
  const [failedIds, setFailedIds] = useState<ReadonlySet<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [bulkRunning, setBulkRunning] = useState(false);

  const query = useInfiniteQuery({
    queryKey: ["knowledge-bits", "rejected", reason ?? "all", subjectId ?? "", q ?? ""],
    queryFn: async ({ pageParam }): Promise<RejectedPage> => {
      const outcome = await listRejectedKnowledgeBits({
        data: {
          limit: PAGE_SIZE,
          offset: pageParam,
          ...(reason ? { reason } : {}),
          ...(subjectId ? { subjectId } : {}),
          ...(q ? { q } : {}),
        },
      });

      if (!outcome.ok) {
        throw new Error(outcome.error);
      }

      return outcome;
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) =>
      lastPage.hasMore ? pages.length * PAGE_SIZE : undefined,
  });

  async function restore(knowledgeBitId: string): Promise<void> {
    const queryKey = ["knowledge-bits", "rejected"];
    const snapshots = queryClient.getQueriesData<
      InfiniteData<RejectedPage, number>
    >({ queryKey });

    setFailedIds((prev) => without(prev, knowledgeBitId));
    setRestoringIds((prev) => new Set(prev).add(knowledgeBitId));
    queryClient.setQueriesData<InfiniteData<RejectedPage, number>>(
      { queryKey },
      (data) =>
        data
          ? {
              ...data,
              pages: data.pages.map((page) => ({
                ...page,
                items: page.items.filter(
                  (item) => item.knowledgeBitId !== knowledgeBitId,
                ),
              })),
            }
          : data,
    );

    let outcome: RestoreRejectedOutcome;

    try {
      outcome = await restoreRejectedKnowledgeBit({ data: { bitId: knowledgeBitId } });
    } catch {
      outcome = { ok: false, reason: "failed" };
    }

    setRestoringIds((prev) => without(prev, knowledgeBitId));

    if (outcome.ok || outcome.reason === "not_found") {
      notifyPendingReviewChanged();

      return;
    }

    if (outcome.reason === "not_rejected") {
      setStaleNotice(true);
      await queryClient.invalidateQueries({ queryKey });

      return;
    }

    for (const [key, data] of snapshots) {
      queryClient.setQueryData(key, data);
    }

    setFailedIds((prev) => new Set(prev).add(knowledgeBitId));
  }

  const freshCounts = query.data?.pages[0]?.reasonCounts;
  const countsRef = useRef<Record<string, number> | undefined>(undefined);

  if (freshCounts) {
    countsRef.current = freshCounts;
  }

  const reasonCounts = freshCounts ?? countsRef.current;
  const totalCount = reasonCounts
    ? Object.values(reasonCounts).reduce((sum, value) => sum + value, 0)
    : undefined;

  const cards = uniqueById((query.data?.pages ?? []).flatMap((page) => page.items), (row) => row.knowledgeBitId);
  const matchCount = query.isSuccess
    ? query.hasNextPage
      ? reason
        ? reasonCounts?.[reason]
        : totalCount
      : cards.length
    : undefined;
  const visibleKey = cards.map((card) => card.knowledgeBitId).join("|");

  useEffect(() => {
    const visible = new Set(visibleKey ? visibleKey.split("|") : []);

    setSelectedIds((prev) => {
      const kept = [...prev].filter((id) => visible.has(id));

      return kept.length === prev.size ? prev : new Set(kept);
    });
  }, [visibleKey]);

  function toggleSelected(id: string): void {
    setSelectedIds((prev) => {
      if (prev.has(id)) {
        return without(prev, id);
      }

      return new Set(prev).add(id);
    });
  }

  async function restoreSelected(): Promise<void> {
    const queryKey = ["knowledge-bits", "rejected"];
    const ids = cards
      .map((card) => card.knowledgeBitId)
      .filter((id) => selectedIds.has(id));

    if (ids.length === 0 || bulkRunning) {
      return;
    }

    setBulkRunning(true);
    setFailedIds((prev) => new Set([...prev].filter((id) => !ids.includes(id))));
    setRestoringIds((prev) => new Set([...prev, ...ids]));

    const outcomes = await runWithConcurrency(
      ids,
      BULK_RESTORE_CONCURRENCY,
      async (bitId): Promise<RestoreRejectedOutcome> => {
        try {
          return await restoreRejectedKnowledgeBit({ data: { bitId } });
        } catch {
          return { ok: false, reason: "failed" };
        }
      },
    );

    const done = new Set<string>();
    const failed = new Set<string>();
    let stale = false;

    outcomes.forEach((outcome, index) => {
      const id = ids[index] as string;

      if (outcome.ok || outcome.reason === "not_found") {
        done.add(id);
      } else if (outcome.reason === "not_rejected") {
        stale = true;
      } else {
        failed.add(id);
      }
    });

    queryClient.setQueriesData<InfiniteData<RejectedPage, number>>(
      { queryKey },
      (data) =>
        data
          ? {
              ...data,
              pages: data.pages.map((page) => ({
                ...page,
                items: page.items.filter((item) => !done.has(item.knowledgeBitId)),
              })),
            }
          : data,
    );
    setRestoringIds((prev) => new Set([...prev].filter((id) => !ids.includes(id))));
    setFailedIds((prev) => new Set([...prev, ...failed]));
    setSelectedIds((prev) => new Set([...prev].filter((id) => failed.has(id))));
    setBulkRunning(false);

    if (done.size > 0) {
      notifyPendingReviewChanged();
    }

    if (stale) {
      setStaleNotice(true);
      await queryClient.invalidateQueries({ queryKey });
    }
  }

  return {
    query,
    cards,
    reasonCounts,
    totalCount,
    matchCount,
    restoringIds,
    failedIds,
    selectedIds,
    setSelectedIds,
    bulkRunning,
    staleNotice,
    restore,
    restoreSelected,
    toggleSelected,
  };
}
