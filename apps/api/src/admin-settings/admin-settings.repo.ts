import { eq } from "drizzle-orm";
import type { AdminSettings, UpdateAdminSettingsInput } from "@post-anki/shared";
import { getDb } from "../db/client.js";
import { appSettings } from "../db/schema.js";

const SETTINGS_ID = "app";

export async function getAdminSettings(): Promise<AdminSettings> {
  const existing = (
    await getDb()
      .select()
      .from(appSettings)
      .where(eq(appSettings.id, SETTINGS_ID))
  )[0];

  if (existing) {
    return { testToggle: existing.testToggle };
  }

  await getDb()
    .insert(appSettings)
    .values({ id: SETTINGS_ID })
    .onConflictDoNothing();

  return { testToggle: false };
}

export async function updateAdminSettings(
  input: UpdateAdminSettingsInput,
): Promise<AdminSettings> {
  await getDb()
    .insert(appSettings)
    .values({ id: SETTINGS_ID, testToggle: input.testToggle, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appSettings.id,
      set: { testToggle: input.testToggle, updatedAt: new Date() },
    });

  return { testToggle: input.testToggle };
}
