import { fetchSubjects, type FetchSubjectsResult, type SubjectOption } from "./fetch-subjects.js";

export const SUBJECTS_CACHE_KEY = "subjectsCache";

export type MenuSubjects = { kind: "subjects"; subjects: SubjectOption[] } | { kind: "token-rejected" };

type SubjectsFetcher = (baseUrl: string, token: string) => Promise<FetchSubjectsResult>;

export async function loadMenuSubjects(
  baseUrl: string,
  token: string,
  fetcher: SubjectsFetcher = fetchSubjects,
): Promise<MenuSubjects> {
  const fetched = await fetcher(baseUrl, token);

  if (fetched.ok) {
    await chrome.storage.local.set({ [SUBJECTS_CACHE_KEY]: fetched.subjects });

    return { kind: "subjects", subjects: fetched.subjects };
  }

  if (fetched.reason === "unauthorized" || fetched.reason === "forbidden") {
    await chrome.storage.local.remove(SUBJECTS_CACHE_KEY);

    return { kind: "token-rejected" };
  }

  const cached = (await chrome.storage.local.get(SUBJECTS_CACHE_KEY))[SUBJECTS_CACHE_KEY];

  return { kind: "subjects", subjects: Array.isArray(cached) ? (cached as SubjectOption[]) : [] };
}
