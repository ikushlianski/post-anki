import type { Subject } from "@post-anki/shared";
import { apiFetch } from "../api/client";

export async function getSubjects(): Promise<Subject[]> {
  return apiFetch<Subject[]>("/subjects");
}
