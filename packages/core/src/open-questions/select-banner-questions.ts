// open-questions-review (issue #87) — the /today banner's only new derived
// value. The repo layer does a capped fetch (`listOpenQuestions('open', 3)`)
// plus a single cheap indexed count (`countOpenQuestions('open')`, not a
// second row-fetch); this pure function turns those two numbers into the
// banner's "show these, +N more" shape (SCENARIO 5, 8) so the arithmetic is
// unit-tested in business language instead of living in a route handler or
// component. Generic over the row shape — the banner doesn't need to know
// anything about an open question beyond "here are the ones already fetched."
export interface BannerSelection<T> {
  shown: T[];
  remainingCount: number;
}

export function selectBannerQuestions<T>(
  rows: T[],
  totalOpenCount: number,
  limit: number,
): BannerSelection<T> {
  const shown = rows.slice(0, limit);

  return {
    shown,
    remainingCount: Math.max(0, totalOpenCount - shown.length),
  };
}
