export type SubjectOption = { id: string; name: string; parentId?: string };

type FetchImpl = typeof fetch;

function toOption(value: unknown): SubjectOption | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const { id, name, parentId } = value as { id?: unknown; name?: unknown; parentId?: unknown };

  if (typeof id !== "string" || id === "" || typeof name !== "string") {
    return null;
  }

  return typeof parentId === "string" && parentId !== "" ? { id, name, parentId } : { id, name };
}

const REQUEST_TIMEOUT_MS = 15_000;

export type FetchSubjectsFailure =
  | { reason: "unauthorized" }
  | { reason: "forbidden" }
  | { reason: "network" }
  | { reason: "other"; status: number };

export type FetchSubjectsResult =
  | { ok: true; subjects: SubjectOption[] }
  | ({ ok: false } & FetchSubjectsFailure);

export async function fetchSubjects(
  baseUrl: string,
  token: string,
  fetchImpl: FetchImpl = fetch,
): Promise<FetchSubjectsResult> {
  const headers: Record<string, string> = {};

  if (token !== "") {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let response: Response;

  try {
    response = await fetchImpl(`${baseUrl}/subjects`, {
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, reason: "network" };
  }

  if (response.status === 401) {
    return { ok: false, reason: "unauthorized" };
  }

  if (response.status === 403) {
    return { ok: false, reason: "forbidden" };
  }

  if (!response.ok) {
    return { ok: false, reason: "other", status: response.status };
  }

  try {
    const data: unknown = await response.json();

    if (!Array.isArray(data)) {
      return { ok: false, reason: "other", status: response.status };
    }

    return {
      ok: true,
      subjects: data.map(toOption).filter((option): option is SubjectOption => option !== null),
    };
  } catch {
    return { ok: false, reason: "other", status: response.status };
  }
}
