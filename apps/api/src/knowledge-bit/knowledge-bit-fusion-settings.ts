import { FUSION_MAX_MODELS, FUSION_MIN_MODELS, resolveUsableKnowledgeItemModelId } from "@post-anki/shared";
import { getAdminSettings } from "../admin-settings/admin-settings.repo.js";
import { log } from "../shared/log.js";

export async function loadFusionModelIds(): Promise<string[]> {
  const settings = await getAdminSettings();

  return settings.fusionEnabled ? settings.fusionModelIds : [];
}

export async function resolveFusionModelIds(
  load: (() => Promise<string[]>) | undefined,
  sourceId: string,
): Promise<string[]> {
  if (!load) {
    return [];
  }

  try {
    const usable = (await load()).filter((id) => resolveUsableKnowledgeItemModelId(id) !== null);
    const distinct = [...new Set(usable)].slice(0, FUSION_MAX_MODELS);

    return distinct.length >= FUSION_MIN_MODELS ? distinct : [];
  } catch (err) {
    log.warn({ err, knowledgeSourceId: sourceId }, "knowledge_bit_fusion_settings_load_failed");

    return [];
  }
}
