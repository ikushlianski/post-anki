import type { WebAuthState } from "@post-anki/shared";
import { loadEnv } from "../shared/env.js";
import { getAuth } from "./auth.js";

export interface AuthStatusDeps {
  isConfigured: () => boolean;
  hasSession: (cookie: string) => Promise<boolean>;
}

export function createWebSessionChecker(deps: AuthStatusDeps) {
  return async (cookie: string): Promise<WebAuthState> => {
    if (!deps.isConfigured()) {
      return "unconfigured";
    }

    return (await deps.hasSession(cookie)) ? "signed_in" : "signed_out";
  };
}

export const checkWebSession = createWebSessionChecker({
  isConfigured: () => {
    const env = loadEnv();

    return Boolean(env.BETTER_AUTH_SECRET) && Boolean(env.OWNER_EMAIL);
  },
  hasSession: async (cookie) => {
    const session = await getAuth().api.getSession({ headers: new Headers({ cookie }) });

    return session !== null;
  },
});
