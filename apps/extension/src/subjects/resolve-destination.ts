import { describeSubjectPath, type Destination } from "./describe-subject-path.js";
import { fetchSubjects, type FetchSubjectsResult, type SubjectOption } from "./fetch-subjects.js";
import { SUBJECTS_CACHE_KEY } from "./load-menu-subjects.js";

type SubjectsFetcher = (baseUrl: string, token: string) => Promise<FetchSubjectsResult>;

async function readCache(): Promise<SubjectOption[]> {
  const cached = (await chrome.storage.local.get(SUBJECTS_CACHE_KEY))[SUBJECTS_CACHE_KEY];

  return Array.isArray(cached) ? (cached as SubjectOption[]) : [];
}

export async function resolveDestination(
  settings: { baseUrl: string; token: string; subjectId?: string },
  fetcher: SubjectsFetcher = fetchSubjects,
): Promise<Destination> {
  if (settings.subjectId === undefined) {
    return { kind: "none" };
  }

  const cachedPath = describeSubjectPath(await readCache(), settings.subjectId);

  if (cachedPath !== null) {
    return { kind: "path", path: cachedPath };
  }

  try {
    const fetched = await fetcher(settings.baseUrl, settings.token);

    if (fetched.ok) {
      await chrome.storage.local.set({ [SUBJECTS_CACHE_KEY]: fetched.subjects });

      const freshPath = describeSubjectPath(fetched.subjects, settings.subjectId);

      if (freshPath !== null) {
        return { kind: "path", path: freshPath };
      }
    }
  } catch {
    return { kind: "unknown" };
  }

  return { kind: "unknown" };
}
