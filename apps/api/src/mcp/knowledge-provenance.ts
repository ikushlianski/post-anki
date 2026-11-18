import { z } from "zod";

export const AI_SOURCE_KINDS = ["ai-session", "ai-explanation"] as const;

export const knowledgeProvenanceShape = {
  sourceKind: z
    .enum(AI_SOURCE_KINDS)
    .optional()
    .describe(
      "Use ai-session for a condensed working session (e.g. a coding session) or ai-explanation for an AI answer. Omit for plain notes.",
    ),
  origin: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .optional()
    .describe("Where it came from, e.g. the tool name and session title: \"Claude Code: migrating auth to JWT\""),
};

export const knowledgeProvenanceSchema = z.object(knowledgeProvenanceShape);

export type KnowledgeProvenance = z.infer<typeof knowledgeProvenanceSchema>;

export const AI_SOURCE_GUIDANCE =
  "To send an AI working session or explanation, pass a condensed lesson summary of what was learned (decisions, concepts, gotchas, why) as the note text, never a raw transcript, and never secrets, tokens, credentials or private personal data. One lesson per note; use a stable key so retries do not duplicate. Set sourceKind to ai-session or ai-explanation and origin to the tool and session title.";
