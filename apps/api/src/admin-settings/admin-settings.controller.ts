import type http from "node:http";
import { updateAdminSettingsInput, type AdminSettings, type AdminSettingsResponse } from "@post-anki/shared";
import { readJsonBody, sendJson } from "../shared/http.js";
import { estimateFusionCostPerSource } from "./fusion-cost-estimate.js";
import {
  getAdminSettings,
  InvalidFusionSettingsError,
  updateAdminSettings,
} from "./admin-settings.repo.js";

function withFusionEstimate(settings: AdminSettings): AdminSettingsResponse {
  return { ...settings, fusionEstimate: estimateFusionCostPerSource(settings.fusionModelIds) };
}

export async function handleGetAdminSettings(
  res: http.ServerResponse,
): Promise<void> {
  sendJson(res, 200, withFusionEstimate(await getAdminSettings()));
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

  try {
    sendJson(res, 200, withFusionEstimate(await updateAdminSettings(body.data)));
  } catch (error) {
    if (error instanceof InvalidFusionSettingsError) {
      sendJson(res, 400, { error: "invalid_input", message: error.issues });

      return;
    }

    throw error;
  }
}
