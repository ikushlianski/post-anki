import type http from "node:http";
import { toNodeHandler } from "better-auth/node";
import { webAuthCheckInputSchema } from "@post-anki/shared";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import { getAuth } from "./auth.js";
import { checkWebSession } from "./auth-status.js";

export const AUTH_PATH_PREFIX = "/api/auth/";

export function isAuthPath(path: string): boolean {
  return path.startsWith(AUTH_PATH_PREFIX);
}

export async function handleAuthRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  await toNodeHandler(getAuth())(req, res);
}

export async function handleWebAuthCheck(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const body = await readJsonBody(req, webAuthCheckInputSchema);

  if (!body.ok) {
    sendError(res, 400, "invalid_body", body.issues);
    return;
  }

  res.setHeader("cache-control", "no-store");
  sendJson(res, 200, { state: await checkWebSession(body.data.cookie) });
}
