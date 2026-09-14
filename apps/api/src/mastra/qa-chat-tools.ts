import { z } from "zod";
import { createTool } from "@mastra/core/tools";
import { isSafeSourceUrl } from "@post-anki/core";
import type { SubtopicSuggestion } from "@post-anki/shared";
import { log } from "../shared/log.js";

// The AI Q&A panel's two tools share one thing with the structure editor's:
// both are read-only with respect to the learner's real, confirmed course
// content. These tools never write to `modules`/`topics` — `suggestSubtopics`
// records a proposal into the in-memory `state` for the caller to surface as
// data (root B turns an accepted suggestion into a `createTopic` call with the
// learner's explicit click), and `searchWeb` only fetches external info and
// returns it. There is no draft snapshot here to justify anything stronger.

export interface QaChatState {
  suggestedSubtopics: SubtopicSuggestion[] | null;
  citations: string[];
}

export interface QaChatToolsDeps {
  state: QaChatState;
  curriculumId: string | null;
  listExistingTopicTitles: () => Promise<string[]>;
  searchWeb: (query: string) => Promise<{ text: string; citations: string[] }>;
}

type SuggestOutcome = { ok: true; recorded: number } | { ok: false; error: string };

type SearchOutcome = { ok: true; text: string; citations: string[] };

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values));
}

export async function suggestSubtopicsFor(
  input: { moduleTitle?: string | null; suggestions: SubtopicSuggestion[] },
  deps: QaChatToolsDeps,
): Promise<SuggestOutcome> {
  if (!deps.curriculumId) {
    return { ok: false, error: "no curriculum in context to suggest sub-topics for" };
  }

  const existingTitles = new Set(
    (await deps.listExistingTopicTitles()).map((t) => t.trim().toLowerCase()),
  );
  const duplicates = input.suggestions.filter((s) =>
    existingTitles.has(s.title.trim().toLowerCase()),
  );

  if (duplicates.length > 0) {
    return {
      ok: false,
      error: `already in this course: ${duplicates.map((d) => d.title).join(", ")}`,
    };
  }

  deps.state.suggestedSubtopics = input.suggestions.map((s) => ({
    title: s.title.trim(),
    rationale: s.rationale,
  }));

  log.info(
    { curriculumId: deps.curriculumId, count: input.suggestions.length },
    "qa_chat_subtopics_suggested",
  );

  return { ok: true, recorded: input.suggestions.length };
}

export async function searchWebFor(
  input: { query: string },
  deps: QaChatToolsDeps,
): Promise<SearchOutcome> {
  const outcome = await deps.searchWeb(input.query);
  const citations = outcome.citations.filter((url) => isSafeSourceUrl(url).allowed);

  deps.state.citations = dedupe([...deps.state.citations, ...citations]);

  return { ok: true, text: outcome.text, citations };
}

export function createQaChatTools(deps: QaChatToolsDeps) {
  const suggestSubtopics = createTool({
    id: "suggestSubtopics",
    description:
      "Propose one or more new sub-topic titles (each with a one-line rationale) for the curriculum currently in context. READ-ONLY — this only records a proposal for the learner to confirm, it never creates anything. Only use when the learner asks to grow their course and a curriculum is actually in view.",
    inputSchema: z.object({
      moduleTitle: z
        .string()
        .nullable()
        .optional()
        .describe("The module the suggestions belong under, or omit for the course overall."),
      suggestions: z
        .array(
          z.object({
            title: z.string().min(1),
            rationale: z.string(),
          }),
        )
        .min(1),
    }),
    execute: (input) => suggestSubtopicsFor(input, deps),
  });

  const searchWeb = createTool({
    id: "searchWeb",
    description:
      "Search the web for current, authoritative information to answer the learner's question. This is a paid call — use it only when the question genuinely needs up-to-date external facts that your own knowledge and the in-view course material cannot supply, never as a routine first step.",
    inputSchema: z.object({ query: z.string().min(1) }),
    execute: (input) => searchWebFor(input, deps),
  });

  return { suggestSubtopics, searchWeb };
}
