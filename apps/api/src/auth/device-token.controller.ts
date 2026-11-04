import type http from "node:http";
import { deviceTokenInputSchema } from "@post-anki/shared";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import { log } from "../shared/log.js";
import { createDeviceToken } from "./device-token.js";
import { CLIENT_IP_HEADER } from "./auth.js";

function clientIp(req: http.IncomingMessage): string {
  const value = req.headers[CLIENT_IP_HEADER];

  return (Array.isArray(value) ? value[0] : value) ?? "unknown";
}

export async function handleCreateDeviceToken(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const body = await readJsonBody(req, deviceTokenInputSchema);

  if (!body.ok) {
    sendError(res, 400, "invalid_body", body.issues);
    return;
  }

  try {
    const outcome = await createDeviceToken(body.data, clientIp(req));

    if (outcome.kind === "rate_limited") {
      if (outcome.retryAfter) {
        res.setHeader("retry-after", outcome.retryAfter);
      }

      sendError(res, 429, "rate_limited", "Too many attempts. Try again later.");
      return;
    }

    if (outcome.kind === "invalid_credentials") {
      sendError(res, 401, "invalid_credentials", "Invalid email or password");
      return;
    }

    res.setHeader("cache-control", "no-store");
    sendJson(res, 201, { token: outcome.token, label: outcome.label });
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : "unknown" }, "device_token_create_failed");
    sendError(res, 500, "internal_error");
  }
}
