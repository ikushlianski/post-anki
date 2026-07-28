import { z } from "zod";

export const depthLevelSchema = z.enum(["awareness", "working", "deep"]);

export type DepthLevel = z.infer<typeof depthLevelSchema>;

export const DEPTH_RANK: Record<DepthLevel, number> = {
  awareness: 1,
  working: 2,
  deep: 3,
};

export const DEPTH_INTENT: Record<DepthLevel, string> = {
  awareness:
    "Know the term and what it is for. Enough to recognize it and not misuse it. No internals.",
  working:
    "Use it correctly day to day and avoid common mistakes. Defend the everyday tradeoffs. Skip the deepest internals.",
  deep: "Reason about internals and edge cases; defend non-obvious design decisions.",
};

// Per-domain-node priority target, in percent — a new, independent mapping
// (domain-priority-review, issue #52), NOT sourced from
// .product/PRINCIPLES.md's maturity-ceiling numbers (architect 50/100,
// practitioner 75/100, deep 100/100), whose labels don't exist in this
// shipped awareness/working/deep enum. Used by
// packages/core/src/domain-map/domain-priority.ts's domainPriorityDistance()
// to compare a domain node's real rollup percentage against its target.
export const DEPTH_TARGET_PERCENT: Record<DepthLevel, number> = {
  awareness: 25,
  working: 60,
  deep: 100,
};
