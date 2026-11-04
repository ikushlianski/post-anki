import { isNotionPageUrl } from "@post-anki/shared";
import { ensureEnglishForItSubject } from "../subject/seed/english-sub-subjects.seed.js";
import { createNotionSource, MEETING_PHRASES_PIPELINE } from "./notion-ingestion-source.repo.js";

export type RegisterEnglishPhrasesResult =
  | { kind: "created"; sourceId: string }
  | { kind: "duplicate_page" }
  | { kind: "invalid_url" };

export async function registerEnglishPhrasesSource(pageUrl: string): Promise<RegisterEnglishPhrasesResult> {
  if (!isNotionPageUrl(pageUrl)) {
    return { kind: "invalid_url" };
  }

  const subjectId = await ensureEnglishForItSubject();
  const result = await createNotionSource({
    name: "English meeting phrases",
    pageUrl: pageUrl.trim(),
    subjectId,
    itemsPerRun: 10,
    frequency: "nightly",
    removeAfterImport: false,
    pipeline: MEETING_PHRASES_PIPELINE,
  });

  return result.kind === "created" ? { kind: "created", sourceId: result.source.id } : result;
}
