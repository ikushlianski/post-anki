export type FetchState = "fetched" | "stale_failed" | "never_fetched";

export interface FetchStateInput {
  fetchedText: string | null;
  lastFetchedAt: string | null;
  lastFetchOutcome: string | null;
}

// SCENARIO 8/9: a real, readable field, not an inference from
// `fetchedText IS NULL` — that null was already ambiguous between "never
// attempted" and "attempted and failed". `lastFetchedAt` alone answers
// "was an attempt ever made"; `lastFetchOutcome` on that most recent
// attempt then decides fetched vs. stale_failed. `fetchedText` is accepted
// per the deriver's own contract but not read here — neither state in this
// function's output depends on it, only on the two fetch-attempt columns.
export function resolveFetchState(input: FetchStateInput): FetchState {
  if (input.lastFetchedAt === null) {
    return "never_fetched";
  }

  return input.lastFetchOutcome === "ok" ? "fetched" : "stale_failed";
}
