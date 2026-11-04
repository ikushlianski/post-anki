import type http from "node:http";
import { getAuth } from "../auth/auth.js";
import { classifyCredential } from "../auth/api-credential.js";
import { loadEnv } from "../shared/env.js";
import type { CurrentSession } from "./account.repo.js";

export async function resolveCurrentSession(req: http.IncomingMessage): Promise<CurrentSession | null> {
  const headers = new Headers();
  const cookie = req.headers.cookie;
  const authorization = req.headers.authorization;

  if (cookie) {
    headers.set("cookie", cookie);
  }

  if (authorization && classifyCredential(authorization, loadEnv().API_SHARED_SECRET) === "session_token") {
    headers.set("authorization", authorization);
  }

  try {
    const result = await getAuth().api.getSession({ headers });

    if (!result) {
      return null;
    }

    return {
      userId: result.user.id,
      sessionId: result.session.id,
      sessionCreatedAt: new Date(result.session.createdAt),
    };
  } catch {
    return null;
  }
}
