import { loadEnv } from "../shared/env.js";
import { log } from "../shared/log.js";
import { decryptSecret } from "./connector-secret.crypto.js";
import { getConnectorSecret } from "./connector-secret.repo.js";

export const NOTION_SECRET_NAME = "notion_token";

export interface ResolvedNotionToken {
  token: string;
  origin: "settings" | "env";
}

export async function resolveNotionToken(): Promise<ResolvedNotionToken | null> {
  const env = loadEnv();
  const stored = env.CONNECTOR_SECRET_KEY ? await getConnectorSecret(NOTION_SECRET_NAME) : null;

  if (stored && env.CONNECTOR_SECRET_KEY) {
    try {
      return { token: decryptSecret(stored, env.CONNECTOR_SECRET_KEY), origin: "settings" };
    } catch {
      log.warn("notion_stored_token_unreadable");
    }
  }

  return env.NOTION_TOKEN ? { token: env.NOTION_TOKEN, origin: "env" } : null;
}
