import type { SubjectOption } from "./fetch-subjects.js";

type FetchImpl = typeof fetch;

export type CreateSubjectResult = { ok: true; subject: SubjectOption } | { ok: false; reason: "empty_name" | "unauthorized" | "network" | "other" };

const REQUEST_TIMEOUT_MS = 15_000;

export async function createSubject(
  baseUrl: string,
  token: string,
  input: { name: string; parentId?: string },
  fetchImpl: FetchImpl = fetch,
): Promise<CreateSubjectResult> {
  const name = input.name.trim();

  if (name === "") {
    return { ok: false, reason: "empty_name" };
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (token !== "") {
    headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    const response = await fetchImpl(`${baseUrl}/subjects`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name, ...(input.parentId ? { parentId: input.parentId } : {}) }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (response.status === 401 || response.status === 403) {
      return { ok: false, reason: "unauthorized" };
    }

    if (!response.ok) {
      return { ok: false, reason: "other" };
    }

    const data = (await response.json()) as { id?: unknown; name?: unknown; parentId?: unknown };

    if (typeof data.id !== "string" || typeof data.name !== "string") {
      return { ok: false, reason: "other" };
    }

    return {
      ok: true,
      subject: typeof data.parentId === "string" ? { id: data.id, name: data.name, parentId: data.parentId } : { id: data.id, name: data.name },
    };
  } catch {
    return { ok: false, reason: "network" };
  }
}
