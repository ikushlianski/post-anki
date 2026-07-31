import { z } from "zod";

// ontology-audit-trail (issue #62) — the wire shape of one ontology_merges
// row, read back on the admin-observability page's "Recent ontology merges"
// section. reassignedCounts stays a loose Record<string, number> (never a
// fixed set of fields) because the four merge functions this log covers
// (mergeSubjects/mergeTags/mergeCurricula/mergeDomainNodes) each move
// different, non-overlapping things.

export const ontologyMergeEntityTypeSchema = z.enum([
  "subject",
  "tag",
  "curriculum",
  "domain_node",
]);

export type OntologyMergeEntityType = z.infer<typeof ontologyMergeEntityTypeSchema>;

export const ontologyMergeLogRowSchema = z.object({
  id: z.string(),
  entityType: ontologyMergeEntityTypeSchema,
  targetId: z.string(),
  targetName: z.string(),
  sourceId: z.string(),
  sourceName: z.string(),
  reassignedCounts: z.record(z.string(), z.number()),
  createdAt: z.string(),
});

export type OntologyMergeLogRow = z.infer<typeof ontologyMergeLogRowSchema>;
