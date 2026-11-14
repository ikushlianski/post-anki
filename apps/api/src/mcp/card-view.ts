import { listAssignmentsForNodes, getTagsByIds } from "../tag/tag.repo.js";
import { listSubjectTree } from "./list-subjects.tool.js";

export async function subjectPathsById(): Promise<Map<string, string>> {
  const { subjects } = await listSubjectTree();

  return new Map(subjects.map((subject) => [subject.id, subject.path]));
}

export async function tagNamesByCardId(cardIds: string[]): Promise<Map<string, string[]>> {
  const assignments = (await listAssignmentsForNodes(cardIds)).filter((a) => a.nodeType === "knowledgeBit");
  const tags = await getTagsByIds([...new Set(assignments.map((a) => a.tagId))]);
  const byCard = new Map<string, string[]>();

  for (const assignment of assignments) {
    const name = tags.get(assignment.tagId)?.name;

    if (name !== undefined) {
      byCard.set(assignment.nodeId, [...(byCard.get(assignment.nodeId) ?? []), name].sort());
    }
  }

  return byCard;
}
