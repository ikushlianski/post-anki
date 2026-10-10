import { eq } from "drizzle-orm";
import {
  DEFAULT_KNOWLEDGE_ITEM_MODEL_ID,
  knowledgeItemModelIdSchema,
  type AdminSettings,
  type KnowledgeItemModelId,
  type ModelTier,
  type UpdateAdminSettingsInput,
} from "@post-anki/shared";
import { getDb } from "../db/client.js";
import { appSettings } from "../db/schema.js";

const SETTINGS_ID = "app";
const DEFAULT_MODEL_TIER: ModelTier = "cheap";

// The logger is loaded only on the fallback path: a static import would make
// every module that reaches this repo read the env at load time.
async function parseKnowledgeItemModelId(stored: string): Promise<KnowledgeItemModelId> {
  const parsed = knowledgeItemModelIdSchema.safeParse(stored);

  if (parsed.success) {
    return parsed.data;
  }

  const { log } = await import("../shared/log.js");

  log.warn({ storedModelId: stored }, "knowledge_item_model_id_unknown_fallback_default");

  return DEFAULT_KNOWLEDGE_ITEM_MODEL_ID;
}

async function toAdminSettings(row: typeof appSettings.$inferSelect): Promise<AdminSettings> {
  return {
    testToggle: row.testToggle,
    modelTier: row.modelTier as ModelTier,
    knowledgeItemModelId: await parseKnowledgeItemModelId(row.knowledgeItemModelId),
  };
}

export async function getAdminSettings(): Promise<AdminSettings> {
  const existing = (
    await getDb()
      .select()
      .from(appSettings)
      .where(eq(appSettings.id, SETTINGS_ID))
  )[0];

  if (existing) {
    return await toAdminSettings(existing);
  }

  await getDb()
    .insert(appSettings)
    .values({ id: SETTINGS_ID })
    .onConflictDoNothing();

  return {
    testToggle: false,
    modelTier: DEFAULT_MODEL_TIER,
    knowledgeItemModelId: DEFAULT_KNOWLEDGE_ITEM_MODEL_ID,
  };
}

export async function updateAdminSettings(
  input: UpdateAdminSettingsInput,
): Promise<AdminSettings> {
  const current = await getAdminSettings();
  const testToggle = input.testToggle ?? current.testToggle;
  const modelTier = input.modelTier ?? current.modelTier;
  const knowledgeItemModelId = input.knowledgeItemModelId ?? current.knowledgeItemModelId;

  await getDb()
    .insert(appSettings)
    .values({
      id: SETTINGS_ID,
      testToggle,
      modelTier,
      knowledgeItemModelId,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: appSettings.id,
      set: { testToggle, modelTier, knowledgeItemModelId, updatedAt: new Date() },
    });

  return { testToggle, modelTier, knowledgeItemModelId };
}

export async function getGlobalModelTier(): Promise<ModelTier> {
  return (await getAdminSettings()).modelTier;
}

export async function getKnowledgeItemModelId(): Promise<KnowledgeItemModelId> {
  return (await getAdminSettings()).knowledgeItemModelId;
}
