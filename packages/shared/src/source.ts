import { z } from "zod";

export const sourceKindSchema = z.enum(["link", "text", "web_research", "llms_txt"]);

export type SourceKind = z.infer<typeof sourceKindSchema>;

export const sourceApprovalStatusSchema = z.enum(["pending", "approved"]);

export type SourceApprovalStatus = z.infer<typeof sourceApprovalStatusSchema>;

export const sourceDiscoveryTierSchema = z.enum(["llms_txt", "docs_crawl", "trusted_search"]);

export type SourceDiscoveryTier = z.infer<typeof sourceDiscoveryTierSchema>;

export const sourceSchema = z.object({
  id: z.string(),
  curriculumId: z.string(),
  kind: sourceKindSchema,
  value: z.string().min(1),
  title: z.string().optional(),
  approvalStatus: sourceApprovalStatusSchema,
  discoveryTier: sourceDiscoveryTierSchema.nullable(),
});

export type Source = z.infer<typeof sourceSchema>;

export const sourceDraftSchema = z.object({
  kind: sourceKindSchema,
  value: z.string().min(1),
  title: z.string().optional(),
});

export type SourceDraft = z.infer<typeof sourceDraftSchema>;
