import { z } from "zod";
import type { KnowledgeBitOverviewState } from "@post-anki/shared";
import { listKnowledgeBitOverview } from "../knowledge-bit/knowledge-bit-overview.repo.js";
import { listNodesByTagId } from "../search/list-nodes-by-tag.repo.js";
import { listTags } from "../tag/tag-read.repo.js";
import { subjectPathsById, tagNamesByCardId } from "./card-view.js";
import { findExistingSubject } from "./subject-ref.js";

const SNIPPET_CHARS = 200;
const ACTIVE_STATES: KnowledgeBitOverviewState[] = ["new", "learning", "review", "relearning", "buried"];

export const searchCardsInputSchema = z.object({
  query: z.string().trim().max(200).optional().describe("Text to find in a card's front or back (case-insensitive substring)"),
  subject: z.string().trim().min(1).max(200).optional().describe("Subject id or path; includes sub-subjects"),
  tagId: z.string().min(1).optional().describe("Tag id from list_tags"),
  tag: z.string().trim().min(1).max(60).optional().describe("Tag name (case-insensitive); ignored when tagId is set"),
  suspended: z.boolean().optional().describe("true: only suspended cards; false: only cards in rotation"),
  limit: z.number().int().min(1).max(100).default(20).describe("Max cards, default 20"),
  offset: z.number().int().min(0).default(0),
});

export const searchCardsResultSchema = z.object({
  cards: z.array(
    z.object({
      id: z.string(),
      front: z.string(),
      backSnippet: z.string(),
      subjectPath: z.string().nullable(),
      tags: z.array(z.string()),
      suspended: z.boolean(),
      dueAt: z.string().nullable(),
    }),
  ),
  hasMore: z.boolean(),
});

export type SearchCardsInput = z.input<typeof searchCardsInputSchema>;
export type SearchCardsResult = z.infer<typeof searchCardsResultSchema>;
export type SearchCardsError = "invalid_path" | "subject_not_found" | "tag_not_found";

async function resolveTagId(input: SearchCardsInput): Promise<string | null | undefined> {
  if (input.tagId) {
    return input.tagId;
  }

  if (!input.tag) {
    return undefined;
  }

  const wanted = input.tag.toLowerCase();

  return (await listTags()).find((tag) => tag.name.toLowerCase() === wanted)?.id ?? null;
}

export async function searchCards(
  input: SearchCardsInput,
  now: Date = new Date(),
): Promise<SearchCardsResult | { error: SearchCardsError }> {
  let subjectId: string | undefined;

  if (input.subject) {
    const subject = await findExistingSubject(input.subject);

    if ("error" in subject) {
      return { error: subject.error === "not_found" ? "subject_not_found" : subject.error };
    }

    subjectId = subject.subjectId;
  }

  const tagId = await resolveTagId(input);

  if (tagId === null) {
    return { error: "tag_not_found" };
  }

  const bitIds = tagId
    ? (await listNodesByTagId(tagId)).nodes.filter((node) => node.kind === "bit").map((node) => node.id)
    : undefined;

  if (bitIds && bitIds.length === 0) {
    return { cards: [], hasMore: false };
  }

  const page = await listKnowledgeBitOverview(
    {
      subjectId,
      q: input.query || undefined,
      limit: input.limit ?? 20,
      offset: input.offset ?? 0,
      states: input.suspended === undefined ? [] : input.suspended ? ["suspended"] : ACTIVE_STATES,
      origins: [],
    },
    now,
    undefined,
    { bitIds },
  );
  const [paths, tags] = await Promise.all([subjectPathsById(), tagNamesByCardId(page.items.map((i) => i.knowledgeBitId))]);

  return {
    cards: page.items.map((item) => ({
      id: item.knowledgeBitId,
      front: item.question,
      backSnippet: item.answer.length > SNIPPET_CHARS ? `${item.answer.slice(0, SNIPPET_CHARS)}…` : item.answer,
      subjectPath: item.subjectId ? (paths.get(item.subjectId) ?? null) : null,
      tags: tags.get(item.knowledgeBitId) ?? [],
      suspended: item.state === "suspended",
      dueAt: item.dueAt,
    })),
    hasMore: page.hasMore,
  };
}
