import { eq } from "drizzle-orm";
import type { AdminSettings, ModelTier, UpdateAdminSettingsInput } from "@post-anki/shared";
import { getDb } from "../db/client.js";
import { appSettings } from "../db/schema.js";

const SETTINGS_ID = "app";
const DEFAULT_MODEL_TIER: ModelTier = "cheap";

function toAdminSettings(row: typeof appSettings.$inferSelect): AdminSettings {
  return {
    testToggle: row.testToggle,
    modelTier: row.modelTier as ModelTier,
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
    return toAdminSettings(existing);
  }

  await getDb()
    .insert(appSettings)
    .values({ id: SETTINGS_ID })
    .onConflictDoNothing();

  return { testToggle: false, modelTier: DEFAULT_MODEL_TIER };
}

export async function updateAdminSettings(
  input: UpdateAdminSettingsInput,
): Promise<AdminSettings> {
  const current = await getAdminSettings();
  const testToggle = input.testToggle ?? current.testToggle;
  const modelTier = input.modelTier ?? current.modelTier;

  await getDb()
    .insert(appSettings)
    .values({ id: SETTINGS_ID, testToggle, modelTier, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appSettings.id,
      set: { testToggle, modelTier, updatedAt: new Date() },
    });

  return { testToggle, modelTier };
}

export async function getGlobalModelTier(): Promise<ModelTier> {
  return (await getAdminSettings()).modelTier;
}
