import { fetchSubjects, type FetchSubjectsFailure, type FetchSubjectsResult } from "./fetch-subjects.js";
import { renderSubjectOptions } from "./render-subject-options.js";

type TokenField = { setAttribute: (name: string, value: string) => void; removeAttribute: (name: string) => void };
type SubjectsView = { select: HTMLSelectElement; note: HTMLElement; tokenInput?: TokenField };
type SubjectsFetcher = (baseUrl: string, token: string) => Promise<FetchSubjectsResult>;

export function describeSubjectsFailure(failure: FetchSubjectsFailure, baseUrl: string, hasToken = true): string {
  switch (failure.reason) {
    case "unauthorized":
      return hasToken ? "Could not load subjects: Token rejected (401)." : "Could not load subjects: No token set.";
    case "forbidden":
      return "Could not load subjects: Extension not allowed (403): set EXTENSION_ID in the API env.";
    case "network":
      return `Could not load subjects: API not reachable at ${baseUrl}.`;
    case "other":
      return `Could not load subjects: API error (${failure.status}).`;
  }
}

export async function loadSubjects(
  view: SubjectsView,
  baseUrl: string,
  token: string,
  selectedId: string | undefined,
  fetcher: SubjectsFetcher = fetchSubjects,
): Promise<void> {
  const result = await fetcher(baseUrl, token);

  if (result.ok) {
    renderSubjectOptions(view.select, result.subjects, selectedId);
    view.note.textContent = "";
    view.tokenInput?.removeAttribute("aria-invalid");

    return;
  }

  renderSubjectOptions(view.select, [], selectedId);
  view.note.textContent = describeSubjectsFailure(result, baseUrl, token !== "");

  if (result.reason === "unauthorized" && token !== "") {
    view.tokenInput?.setAttribute("aria-invalid", "true");
  } else {
    view.tokenInput?.removeAttribute("aria-invalid");
  }
}
