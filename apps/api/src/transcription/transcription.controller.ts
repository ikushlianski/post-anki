import type http from "node:http";
import { transcribeAudioInput } from "@post-anki/shared";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import { log } from "../shared/log.js";
import { transcribeAudio } from "./transcription-client.js";

// POST /transcriptions. Body-size protection is entirely inherited from
// readJsonBody/MAX_BODY_BYTES (apps/api/src/shared/http.ts) — no separate
// size check here, so it can never drift out of sync with the limit every
// other endpoint already shares (spec.md Decision 4, AC 20).
export async function handleCreateTranscription(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const body = await readJsonBody(req, transcribeAudioInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  try {
    const text = await transcribeAudio(body.data);

    sendJson(res, 200, { text });
  } catch (err) {
    log.error({ err }, "transcription_failed");

    const message = err instanceof Error ? err.message : "transcription failed";

    sendError(res, 502, "transcription_failed", message);
  }
}
