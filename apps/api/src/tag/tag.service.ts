import type { NodeType, Tag, TagAssignment } from "@post-anki/shared";
import {
  assignTag,
  getTag,
  listTags,
  removeTagAssignment,
  resolveOrCreateTag,
} from "./tag.repo.js";

export async function getAllTags(): Promise<Tag[]> {
  return listTags();
}

export async function createOrGetTag(name: string): Promise<Tag> {
  return resolveOrCreateTag(name);
}

export type AssignTagError = "tag_not_found";

export async function addTagAssignment(
  tagId: string,
  nodeType: NodeType,
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
