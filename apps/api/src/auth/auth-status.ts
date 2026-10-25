import { count } from "drizzle-orm";
import type { WebAuthState } from "@post-anki/shared";
import { getDb } from "../db/client.js";
import { users } from "../db/schema.js";
import { loadEnv } from "../shared/env.js";
import { getAuth } from "./auth.js";

export interface AuthStatusDeps {
  isConfigured: () => boolean;
  countUsers: () => Promise<number>;
  hasSession: (cookie: string) => Promise<boolean>;
}

export function createWebSessionChecker(deps: AuthStatusDeps) {
  let ownerSeen = false;

  return async (cookie: string): Promise<WebAuthState> => {
    if (!deps.isConfigured()) {
      return "unconfigured";
    }

    if (!ownerSeen) {
      ownerSeen = (await deps.countUsers()) > 0;
    }

    if (!ownerSeen) {
      return "unconfigured";
    }

    return (await deps.hasSession(cookie)) ? "signed_in" : "signed_out";
  };
}

export const checkWebSession = createWebSessionChecker({
  isConfigured: () => Boolean(loadEnv().RESEND_API_KEY),
  countUsers: async () => {
    const [row] = await getDb().select({ total: count() }).from(users);

    return row?.total ?? 0;
  },
  hasSession: async (cookie) => {
    const session = await getAuth().api.getSession({ headers: new Headers({ cookie }) });

    return session !== null;
  },
});
