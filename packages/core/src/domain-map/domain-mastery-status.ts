export type DomainMasteryStatus = "gap" | "progress";

// separate-progress-overlay-from-structure (issue #85) — the mastery
// overlay's only new derived value. `percent` (domainNodeProgress's
// existing subtree rollup) already distinguishes "nothing learned" from
// "some progress" numerically; this just names that distinction so the UI
// has a single place to decide "gap" vs. "progress" instead of comparing to
// zero inline wherever a badge is rendered. Gap is deliberately percent ===
// 0 only, not a separate "never studied" vs. "studied but scored zero"
// signal — see spec.md's Decisions.
export function domainMasteryStatus(percent: number): DomainMasteryStatus {
  return percent === 0 ? "gap" : "progress";
}
