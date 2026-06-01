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
