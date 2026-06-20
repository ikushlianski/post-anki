import type http from "node:http";
import { updateAdminSettingsInput } from "@post-anki/shared";
import { readJsonBody, sendJson } from "../shared/http.js";
import {
  getAdminSettings,
  updateAdminSettings,
} from "./admin-settings.repo.js";

export async function handleGetAdminSettings(
  res: http.ServerResponse,
): Promise<void> {
  sendJson(res, 200, await getAdminSettings());
}

export async function handleUpdateAdminSettings(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const body = await readJsonBody(req, updateAdminSettingsInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  sendJson(res, 200, await updateAdminSettings(body.data));
}
