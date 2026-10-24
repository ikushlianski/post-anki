export type SubjectOption = { id: string; name: string };

type FetchImpl = typeof fetch;

function toOption(value: unknown): SubjectOption | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const { id, name } = value as { id?: unknown; name?: unknown };

  return typeof id === "string" && id !== "" && typeof name === "string" ? { id, name } : null;
}

export async function fetchSubjects(
  baseUrl: string,
  token: string,
  fetchImpl: FetchImpl = fetch,
): Promise<SubjectOption[] | null> {
  const headers: Record<string, string> = {};

  if (token !== "") {
    headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    const response = await fetchImpl(`${baseUrl}/subjects`, { headers });

    if (!response.ok) {
      return null;
    }

    const data: unknown = await response.json();

    if (!Array.isArray(data)) {
      return null;
    }

    return data.map(toOption).filter((option): option is SubjectOption => option !== null);
  } catch {
    return null;
  }
}
