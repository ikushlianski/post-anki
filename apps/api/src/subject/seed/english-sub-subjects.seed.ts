import { getDb, type DbExecutor } from "../../db/client.js";
import { seedSubSubjects, type SubjectSeedNode } from "./business-sub-subjects.seed.js";
import { createSubjectSeedStore, type RootCapableSeedStore } from "./subject-seed.store.js";

export const ENGLISH_SUBJECT_NAME = "English";
export const ENGLISH_FOR_IT_NAME = "English for IT";

const ENGLISH_ROOT_DESCRIPTION = "Everyday conversational and work/tech-context English.";

export const ENGLISH_SUB_SUBJECTS: SubjectSeedNode[] = [{ name: ENGLISH_FOR_IT_NAME }];

export async function ensureEnglishForItWithStore(store: RootCapableSeedStore): Promise<string> {
  const rootId =
    (await store.findRootByName(ENGLISH_SUBJECT_NAME)) ??
    (await store.createRoot(ENGLISH_SUBJECT_NAME, ENGLISH_ROOT_DESCRIPTION));

  await seedSubSubjects(store, ENGLISH_SUBJECT_NAME, ENGLISH_SUB_SUBJECTS);

  const childId = await store.findChildByName(rootId, ENGLISH_FOR_IT_NAME);

  if (!childId) {
    throw new Error(`Subject "${ENGLISH_FOR_IT_NAME}" could not be created`);
  }

  return childId;
}

export function ensureEnglishForItSubject(db: DbExecutor = getDb()): Promise<string> {
  return ensureEnglishForItWithStore(createSubjectSeedStore(db));
}
