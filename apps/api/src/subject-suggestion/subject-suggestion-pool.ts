import { COMMON_SUBJECT_NAME } from "../subject/subject-leaf.js";

interface PoolSubject {
  id: string;
  name: string;
}

export function pickSubSubjectPoolIds(subject: PoolSubject, children: PoolSubject[]): string[] {
  const common = children.find((child) => child.name === COMMON_SUBJECT_NAME);

  return common ? [subject.id, common.id] : [subject.id];
}
