import {
  domainNodeProgress,
  type DomainNodeCurriculumTopics,
  type DomainNodeRef,
} from "../domain-map/domain-map-progress";
import { domainMasteryStatus, type DomainMasteryStatus } from "../domain-map/domain-mastery-status";

export interface CoverageAreaNode {
  id: string;
  name: string;
  subjectName: string;
}

export interface CoverageArea {
  domainNodeId: string;
  name: string;
  subjectName: string;
  percent: number;
  status: DomainMasteryStatus;
}

export function buildCoverageReport(
  areaNodes: CoverageAreaNode[],
  nodes: DomainNodeRef[],
  curriculumTopics: DomainNodeCurriculumTopics[],
): CoverageArea[] {
  return areaNodes.map((area) => {
    const percent = domainNodeProgress(area.id, nodes, curriculumTopics).percent;

    return {
      domainNodeId: area.id,
      name: area.name,
      subjectName: area.subjectName,
      percent,
      status: domainMasteryStatus(percent),
    };
  });
}
