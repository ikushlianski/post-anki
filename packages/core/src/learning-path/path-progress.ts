import type { ModuleProgress } from "@post-anki/shared";
import { domainNodeProgress, type DomainNodeCurriculumTopics, type DomainNodeRef } from "../domain-map/domain-map-progress";

export type PathStepStatus = "not_started" | "in_progress" | "done";

export interface PathStepRef {
  domainNodeId: string;
}

export interface PathStepProgress {
  domainNodeId: string;
  progress: ModuleProgress;
  status: PathStepStatus;
}

export interface PathProgress {
  overallStatus: PathStepStatus;
  steps: PathStepProgress[];
}

export function derivePathStepStatus(progress: ModuleProgress): PathStepStatus {
  if (progress.topicsIncluded === 0) {
    return "not_started";
  }

  if (progress.topicsMastered === progress.topicsIncluded) {
    return "done";
  }

  return "in_progress";
}

export function pathProgress(
  steps: PathStepRef[],
  nodes: DomainNodeRef[],
  curriculumTopics: DomainNodeCurriculumTopics[],
): PathProgress {
  const stepProgress = steps.map((step) => {
    const progress = domainNodeProgress(step.domainNodeId, nodes, curriculumTopics);

    return {
      domainNodeId: step.domainNodeId,
      progress,
      status: derivePathStepStatus(progress),
    };
  });

  return {
    overallStatus: deriveOverallStatus(stepProgress.map((step) => step.status)),
    steps: stepProgress,
  };
}

function deriveOverallStatus(statuses: PathStepStatus[]): PathStepStatus {
  if (statuses.length === 0 || statuses.every((status) => status === "not_started")) {
    return "not_started";
  }

  if (statuses.every((status) => status === "done")) {
    return "done";
  }

  return "in_progress";
}
