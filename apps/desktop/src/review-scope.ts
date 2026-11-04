import type { ReviewScope, SubjectDueCounts } from "@/api/review-commands";
import type { Subject } from "@/api/desktop-commands";

export const AHEAD_OPTIONS: readonly number[] = [0, 1, 2, 3, 7];

export const MAX_AHEAD_DAYS = 30;

export const AHEAD_STORAGE_KEY = "review-ahead-days";

export function scopeKey(scope: ReviewScope): string {
  return `${scope.subjectId ?? "all"}|${scope.aheadDays}`;
}

export function aheadLabel(days: number): string {
  if (days === 0) {
    return "Off";
  }

  return days === 1 ? "1 day" : `${days} days`;
}

export function clampAheadDays(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(Math.max(Math.trunc(value), 0), MAX_AHEAD_DAYS);
}

export function parseStoredAheadDays(raw: string | null): number {
  return raw === null ? 0 : clampAheadDays(Number(raw));
}

export type SubjectOption = { value: string; label: string };

export function subjectOptions(subjects: readonly Subject[], counts: SubjectDueCounts | null): SubjectOption[] {
  const byId = new Map((counts?.subjects ?? []).map((row) => [row.subjectId, row]));

  return subjects.map((subject) => {
    const row = byId.get(subject.id);
    const summary = row ? dueSummary(row.dueCount, row.newCount) : null;

    return {
      value: subject.id,
      label: summary ? `${subject.name} (${summary})` : subject.name,
    };
  });
}

export function dueSummary(due: number, fresh: number): string {
  if (due === 0 && fresh === 0) {
    return "nothing due";
  }

  return [due > 0 ? `${due} due` : null, fresh > 0 ? `${fresh} new` : null].filter(Boolean).join(" · ");
}
