import { and, ilike, isNull } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { curricula, subjects, topics } from "../db/schema.js";

export interface SearchSubjectResult {
  id: string;
  name: string;
}

export interface SearchCurriculumResult {
  id: string;
  name: string;
}

export interface SearchTopicResult {
  id: string;
  title: string;
  curriculumId: string;
}

export async function searchSubjects(query: string): Promise<SearchSubjectResult[]> {
  return getDb()
    .select({ id: subjects.id, name: subjects.name })
    .from(subjects)
    .where(ilike(subjects.name, `%${query}%`));
}

// learning-list-fold-in — mirrors listCurricula's exclusion of container
// curricula (curriculum.repo.ts's listCurricula): a container row is
// plumbing, never something the learner searches for by name.
export async function searchCurricula(query: string): Promise<SearchCurriculumResult[]> {
  return getDb()
    .select({ id: curricula.id, name: curricula.name })
    .from(curricula)
    .where(and(isNull(curricula.containerAreaNodeId), ilike(curricula.name, `%${query}%`)));
}

export async function searchTopics(query: string): Promise<SearchTopicResult[]> {
  return getDb()
    .select({ id: topics.id, title: topics.title, curriculumId: topics.curriculumId })
    .from(topics)
    .where(ilike(topics.title, `%${query}%`));
}
