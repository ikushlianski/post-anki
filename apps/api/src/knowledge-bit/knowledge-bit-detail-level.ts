import type { DetailLevel } from "@post-anki/shared";
import { log } from "../shared/log.js";

export type DetailLevelLoader = (subjectId: string | null) => Promise<DetailLevel>;

export async function loadDetailLevelSafely(
  subjectId: string | null,
  load?: DetailLevelLoader,
): Promise<DetailLevel | undefined> {
  if (!load) {
    return undefined;
  }

  try {
    return await load(subjectId);
  } catch (err) {
    log.warn({ err, subjectId }, "knowledge_bit_detail_level_load_failed");

    return undefined;
  }
}
