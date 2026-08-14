import { z } from "zod";

// deepen-widen-recommendations (issue #90) — same zod-schema-plus-inferred-
// type shape as domain-map.ts's own domainPrioritySuggestionSchema family.

export const domainRecommendationAxisSchema = z.enum(["deepen", "widen"]);

export type DomainRecommendationAxis = z.infer<typeof domainRecommendationAxisSchema>;

export const domainRecommendationStatusSchema = z.enum(["pending", "accepted", "rejected"]);

export type DomainRecommendationStatus = z.infer<typeof domainRecommendationStatusSchema>;

// One row per suggestion a trigger run produces (domain_recommendations).
// `source` is the producer discriminator seam a future non-structural
// producer plugs into later, without a schema change — this pass only ever
// writes "structural" (spec.md's Decision 1: no LLM call anywhere in this
// feature). `createdCurriculumId` is always carried on read (spec.md's
// Decision 10) — null unless resolved "accepted".
export const domainRecommendationSchema = z.object({
  id: z.string(),
  subjectId: z.string(),
  domainNodeId: z.string(),
  sourceNodeId: z.string(),
  axis: domainRecommendationAxisSchema,
  reason: z.string().min(1),
  source: z.string().min(1),
  status: domainRecommendationStatusSchema,
  createdAt: z.string(),
  resolvedAt: z.string().nullable(),
  createdCurriculumId: z.string().nullable(),
});

export type DomainRecommendation = z.infer<typeof domainRecommendationSchema>;

// POST /subjects/:id/domain-recommendations (trigger).
export const triggerDomainRecommendationsResultSchema = z.array(domainRecommendationSchema);

export type TriggerDomainRecommendationsResult = z.infer<
  typeof triggerDomainRecommendationsResultSchema
>;

// PATCH /domain-recommendations/:id
export const resolveDomainRecommendationInput = z.object({
  status: z.enum(["accepted", "rejected"]),
});

export type ResolveDomainRecommendationInput = z.infer<typeof resolveDomainRecommendationInput>;
