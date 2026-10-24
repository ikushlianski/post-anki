import type http from "node:http";
import { gamificationProfileSchema } from "@post-anki/shared";
import { sendJson } from "../shared/http.js";
import { getGamificationProfile } from "./gamification.service.js";

export async function handleGetGamificationProfile(res: http.ServerResponse): Promise<void> {
  const profile = await getGamificationProfile();

  sendJson(res, 200, gamificationProfileSchema.parse(profile));
}
