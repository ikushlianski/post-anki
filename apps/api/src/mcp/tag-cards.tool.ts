import { z } from "zod";
import type { RequestAuthContext } from "../auth/request-auth-context.js";
import { getKnowledgeBitById } from "../knowledge-bit/knowledge-bit-read.repo.js";
import {
  assignTag,
  getTagsByIds,
  listAssignmentsForNodes,
  removeTagAssignment,
  resolveOrCreateTag,
} from "../tag/tag.repo.js";
import { hasCardWriteScope } from "./card-write-scope.js";

const MAX_CARDS = 100;
const MAX_TAGS = 20;

const tagNameSchema = z.string().trim().min(1).max(60);

export const tagCardsInputSchema = z.object({
  cardIds: z.array(z.string().min(1)).min(1).max(MAX_CARDS).describe("Knowledge bit ids to tag"),
  add: z.array(tagNameSchema).max(MAX_TAGS).default([]).describe("Tag names to add (created when new)"),
  remove: z.array(tagNameSchema).max(MAX_TAGS).default([]).describe("Tag names to remove"),
});

export const tagCardsResultSchema = z.object({
  tagged: z.array(z.object({ cardId: z.string(), tags: z.array(z.string()) })),
  notFound: z.array(z.string()),
});

export type TagCardsInput = z.input<typeof tagCardsInputSchema>;
export type TagCardsResult = z.infer<typeof tagCardsResultSchema>;

export type TagCardsOutcome = TagCardsResult | { error: "missing_scope" | "nothing_to_do" };

export async function tagCards(
  input: TagCardsInput,
  auth: Pick<RequestAuthContext, "scopes">,
): Promise<TagCardsOutcome> {
  if (!hasCardWriteScope(auth)) {
    return { error: "missing_scope" };
  }

  const add = input.add ?? [];
  const remove = input.remove ?? [];

  if (add.length === 0 && remove.length === 0) {
    return { error: "nothing_to_do" };
  }

  const cardIds = [...new Set(input.cardIds)];
  const found: string[] = [];
  const notFound: string[] = [];

  for (const cardId of cardIds) {
    ((await getKnowledgeBitById(cardId)) ? found : notFound).push(cardId);
  }

  const addTags = await Promise.all(add.map((name) => resolveOrCreateTag(name)));
  const addKeys = new Set(add.map((name) => name.toLowerCase()));
  const removeKeys = new Set(remove.map((name) => name.toLowerCase()).filter((key) => !addKeys.has(key)));
  const tagged: TagCardsResult["tagged"] = [];

  for (const cardId of found) {
    for (const tag of addTags) {
      await assignTag(tag.id, "knowledgeBit", cardId);
    }

    const assignments = (await listAssignmentsForNodes([cardId])).filter(
      (assignment) => assignment.nodeType === "knowledgeBit",
    );
    const tagsById = await getTagsByIds(assignments.map((assignment) => assignment.tagId));
    const names: string[] = [];

    for (const assignment of assignments) {
      const name = tagsById.get(assignment.tagId)?.name;

      if (name === undefined) {
        continue;
      }

      if (removeKeys.has(name.toLowerCase())) {
        await removeTagAssignment(assignment.tagId, assignment.id);
        continue;
      }

      names.push(name);
    }

    tagged.push({ cardId, tags: names.sort() });
  }

  return { tagged, notFound };
}
