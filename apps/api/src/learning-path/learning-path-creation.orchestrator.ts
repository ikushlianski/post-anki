import { resolvePathOrder } from "@post-anki/core";
import {
  getRoleTemplateDefinition,
  resolveRoleTemplateTargets,
  WEB_DEVELOPMENT_SUBJECT_NAME,
} from "./role-templates.js";
import {
  getNodeOrdersByIds,
  getSubjectIdByName,
  insertLearningPath,
  listNamedNodesForSubject,
  listPrerequisiteEdgesAmongNodes,
  type LearningPathRecord,
  type LearningPathStepRecord,
} from "./learning-path.repo.js";

export type CreateLearningPathFromTemplateError = "role_template_not_found" | "subject_not_found";

export async function createLearningPathFromTemplate(
  roleTemplateId: string,
): Promise<
  | { path: LearningPathRecord; steps: LearningPathStepRecord[] }
  | { error: CreateLearningPathFromTemplateError }
> {
  const definition = getRoleTemplateDefinition(roleTemplateId);

  if (!definition) {
    return { error: "role_template_not_found" };
  }

  const subjectId = await getSubjectIdByName(WEB_DEVELOPMENT_SUBJECT_NAME);

  if (!subjectId) {
    return { error: "subject_not_found" };
  }

  const nodes = await listNamedNodesForSubject(subjectId);
  const resolvedTargets = resolveRoleTemplateTargets(definition, nodes);
  const targetNodeIds = resolvedTargets.map((target) => target.domainNodeId);

  const [nodeOrders, prerequisiteEdges] = await Promise.all([
    getNodeOrdersByIds(targetNodeIds),
    listPrerequisiteEdgesAmongNodes(targetNodeIds),
  ]);

  const orderedDomainNodeIds = resolvePathOrder(targetNodeIds, nodeOrders, prerequisiteEdges);

  return insertLearningPath({
    name: definition.name,
    targetRoleLabel: definition.targetRoleLabel,
    orderedDomainNodeIds,
  });
}
