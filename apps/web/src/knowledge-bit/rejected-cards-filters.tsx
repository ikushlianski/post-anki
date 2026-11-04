import { useLiveQuery } from "@tanstack/react-db";
import { useEffect, useRef, useState } from "react";
import { buildSubjectPathLabel } from "@post-anki/core";
import {
  KNOWLEDGE_BIT_REJECT_REASON_LABELS,
  knowledgeBitFeedbackReasonSchema,
  type KnowledgeBitFeedbackReason,
} from "@post-anki/shared";

import { mapSubjectRow, subjectsCollection } from "../curriculum/board.collection";

const SEARCH_DEBOUNCE_MS = 300;
const MAX_QUERY_LENGTH = 200;
const REASON_OPTIONS = knowledgeBitFeedbackReasonSchema.options;

interface RejectedCardsFiltersProps {
  reason: KnowledgeBitFeedbackReason | undefined;
  subjectId: string | undefined;
  q: string | undefined;
  reasonCounts: Record<string, number> | undefined;
  totalCount: number | undefined;
  onReasonChange: (reason: KnowledgeBitFeedbackReason | undefined) => void;
  onSubjectChange: (subjectId: string | undefined) => void;
  onQueryChange: (q: string | undefined) => void;
}

function chipClass(active: boolean): string {
  return active
    ? "min-h-[44px] rounded-full bg-neutral-900 px-3 py-1 text-xs font-medium text-white sm:min-h-0"
    : "min-h-[44px] rounded-full border border-neutral-200 px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100 sm:min-h-0";
}

export function RejectedCardsFilters({
  reason,
  subjectId,
  q,
  reasonCounts,
  totalCount,
  onReasonChange,
  onSubjectChange,
  onQueryChange,
}: RejectedCardsFiltersProps) {
  const subjectsQuery = useLiveQuery((b) => b.from({ subject: subjectsCollection }), []);
  const subjects = (subjectsQuery.data ?? []).map(mapSubjectRow);
  const subjectOptions = subjects
    .map((subject) => ({
      id: subject.id,
      label: buildSubjectPathLabel(subject.id, subjects),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const [draft, setDraft] = useState(q ?? "");

  const onQueryChangeRef = useRef(onQueryChange);

  onQueryChangeRef.current = onQueryChange;

  useEffect(() => {
    const next = draft.trim() || undefined;

    if (next === q) {
      return;
    }

    const timer = setTimeout(() => onQueryChangeRef.current(next), SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [draft, q]);

  return (
    <>
      <input
        type="search"
        data-testid="rejected-cards-search"
        aria-label="Search rejected cards"
        placeholder="Search rejected cards"
        maxLength={MAX_QUERY_LENGTH}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        className="mb-4 min-h-[44px] w-full rounded-md border border-neutral-200 px-3 py-2 text-sm sm:min-h-0"
      />

      <select
        data-testid="rejected-cards-subject"
        aria-label="Filter by subject"
        value={subjectId ?? ""}
        onChange={(event) => onSubjectChange(event.target.value || undefined)}
        className="mb-4 min-h-[44px] w-full rounded-md border border-neutral-200 px-3 py-2 text-sm sm:min-h-0"
      >
        <option value="">All subjects</option>
        {subjectId && !subjectOptions.some((option) => option.id === subjectId) ? (
          <option value={subjectId}>{subjectId}</option>
        ) : null}
        {subjectOptions.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>

      <div
        role="group"
        aria-label="Reject reason"
        className="mb-6 flex flex-wrap gap-2"
      >
        <button
          type="button"
          data-testid="rejected-cards-chip-all"
          aria-pressed={reason === undefined}
          className={chipClass(reason === undefined)}
          onClick={() => onReasonChange(undefined)}
        >
          All reasons
          {totalCount === undefined ? null : (
            <span data-testid="rejected-cards-count-all"> ({totalCount})</span>
          )}
        </button>
        {REASON_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            data-testid={`rejected-cards-chip-${option}`}
            aria-pressed={reason === option}
            className={chipClass(reason === option)}
            onClick={() => onReasonChange(option)}
          >
            {KNOWLEDGE_BIT_REJECT_REASON_LABELS[option]}
            {reasonCounts === undefined ? null : (
              <span data-testid={`rejected-cards-count-${option}`}> ({reasonCounts[option] ?? 0})</span>
            )}
          </button>
        ))}
      </div>
    </>
  );
}
