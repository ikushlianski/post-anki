import { z } from "zod";

export const decideInput = z.object({
  decision: z.string().trim().min(1),
  opinion: z.string().trim().min(1),
});

export type DecideInput = z.infer<typeof decideInput>;

// The decide agent's own structured-output contract (LLM-facing shape) —
// UNTOUCHED by decide-mode's persistence plan. blindSpots stays a bare
// string[] here; the orchestrator wraps each string into its own
// DecideBlindSpot row with a server-generated id at insert time (spec.md's
// "Agent / schema split" section — LLMs are unreliable at producing stable,
// collision-free ids).
export const decideResultSchema = z.object({
  strengths: z.array(z.string()),
  blindSpots: z.array(z.string()),
  questions: z.array(z.string()),
  verdict: z.string(),
});

export type DecideResult = z.infer<typeof decideResultSchema>;

export const decideBlindSpotStatusSchema = z.enum(["pending", "accepted", "rejected"]);

export type DecideBlindSpotStatus = z.infer<typeof decideBlindSpotStatusSchema>;

// One row per blind spot the mentor surfaces for a session — the persisted,
// individually-actionable shape (spec.md's Decision #3), modeled directly on
// the already-shipped domain_priority_suggestions accept/reject pattern.
export const decideBlindSpotSchema = z.object({
  id: z.string(),
  description: z.string(),
  status: decideBlindSpotStatusSchema,
  resolvedAt: z.string().nullable(),
});

export type DecideBlindSpot = z.infer<typeof decideBlindSpotSchema>;

// The persisted, client-visible shape returned by POST/GET /decide-sessions
// — strengths/questions stay plain text arrays (nothing in the wishlist asks
// them to be individually actionable); blindSpots carries real ids + status.
export const decideSessionSchema = z.object({
  id: z.string(),
  decision: z.string(),
  opinion: z.string(),
  verdict: z.string(),
  strengths: z.array(z.string()),
  questions: z.array(z.string()),
  blindSpots: z.array(decideBlindSpotSchema),
  createdAt: z.string(),
});

export type DecideSession = z.infer<typeof decideSessionSchema>;

// PATCH /decide-blind-spots/:id body — mirrors
// resolveDomainPrioritySuggestionInput's exact shape and semantics.
export const resolveDecideBlindSpotInput = z.object({
  status: z.enum(["accepted", "rejected"]),
});

export type ResolveDecideBlindSpotInput = z.infer<typeof resolveDecideBlindSpotInput>;
