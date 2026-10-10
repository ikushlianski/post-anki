export const DEFAULT_BASE_URL = "http://localhost:5560";

export type Settings = { baseUrl: string; token: string };

export type SaveSettingsResult = { ok: true } | { ok: false; reason: "invalid_base_url" };

const STORAGE_KEY = "settings";

export function normalizeBaseUrl(raw: string): string | null {
  let parsed: URL;

  try {
    parsed = new URL(raw.trim());
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  return parsed.toString().replace(/\/+$/, "");
}

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const value = stored[STORAGE_KEY] as Partial<Settings> | undefined;
  const baseUrl = typeof value?.baseUrl === "string" ? normalizeBaseUrl(value.baseUrl) : null;

  return {
    baseUrl: baseUrl ?? DEFAULT_BASE_URL,
    token: typeof value?.token === "string" ? value.token.trim() : "",
  };
}

export async function saveSettings(input: Settings): Promise<SaveSettingsResult> {
  const baseUrl = input.baseUrl.trim() === "" ? DEFAULT_BASE_URL : normalizeBaseUrl(input.baseUrl);

  if (baseUrl === null) {
    return { ok: false, reason: "invalid_base_url" };
  }

  await chrome.storage.local.set({ [STORAGE_KEY]: { baseUrl, token: input.token.trim() } });

  return { ok: true };
}
