import type { SocraticSessionSummary } from "@post-anki/shared";

// Session summary (issue #27). The gap-shown branch is real and ready —
// gated on mostRecentGap !== null — but structurally dormant today: nothing
// currently populates it (spec.md Decision 1). Every session this story
// ships renders the honest zero-gap fallback line, never a fabricated one.
export function formatSessionSummary(summary: SocraticSessionSummary): string {
  const gapLine = summary.mostRecentGap
    ? `Gap (most recent): ${summary.mostRecentGap.label}\nGaps logged: ${summary.gapsLoggedCount}`
    : "Solid session — no new gaps logged.";

  return [
    "Session summary",
    `Tool: ${summary.topicTitle} | Depth: ${summary.depth}`,
    "",
    `Solid understanding: ${summary.solidConcepts.join(", ")}`,
    gapLine,
  ].join("\n");
}
