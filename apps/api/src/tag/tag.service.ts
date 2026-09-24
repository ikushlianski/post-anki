import type { MergeTagsResult, Tag, TagAssignment, TagNodeType } from "@post-anki/shared";
import {
  assignTag,
  getTag,
  getTagMasteryStatuses,
  listTags,
  removeTagAssignment,
  resolveOrCreateTag,
  type TagMasteryStatusRow,
} from "./tag.repo.js";
import { type MergeTagsError, mergeTags } from "./tag-merge.repo.js";

export async function getAllTags(): Promise<Tag[]> {
  return listTags();
}

export async function getAllTagMasteryStatuses(): Promise<TagMasteryStatusRow[]> {
  return getTagMasteryStatuses();
}

export async function createOrGetTag(name: string): Promise<Tag> {
  return resolveOrCreateTag(name);
}

export type AssignTagError = "tag_not_found";

export async function addTagAssignment(
  tagId: string,
  nodeType: TagNodeType,
  nodeId: string,
): Promise<TagAssignment | { error: AssignTagError }> {
  const tag = await getTag(tagId);

  if (!tag) {
    return { error: "tag_not_found" };
  }

  return assignTag(tagId, nodeType, nodeId);
}

export async function deleteTagAssignment(
  tagId: string,
  assignmentId: string,
): Promise<boolean> {
  return removeTagAssignment(tagId, assignmentId);
}

export async function mergeTagsService(
  targetId: string,
  sourceId: string,
): Promise<MergeTagsResult | { error: MergeTagsError }> {
  return mergeTags(targetId, sourceId);
}
