import { getBot } from "../telegram/bot.js";
import { loadEnv } from "../env.js";
import { transcribeAudio } from "../api/client.js";
import { log } from "../telegram/log.js";

const DEFAULT_MIME_TYPE = "audio/ogg";

function fileDownloadUrl(botToken: string, filePath: string): string {
  return `https://api.telegram.org/file/bot${botToken}/${filePath}`;
}

// AC 15-17 (.planning/22-voice-responses/scenarios.md) — downloads a
// Telegram voice note by file id, base64-encodes it, and hands it to
// apps/api's /transcriptions endpoint via apiFetch's own transcribeAudio.
// Every failure point (getFile, the download itself, a rejected
// transcribeAudio call) is caught here and produces null — this function
// never throws, so a mechanical failure always reaches webhook.handler.ts
// as a value, never an unhandled rejection (AC 16).
export async function transcribeVoiceNote(
  fileId: string,
  mimeType: string | undefined,
): Promise<string | null> {
  try {
    const file = await getBot().api.getFile(fileId);

    if (!file.file_path) {
      log.error({ file_id: fileId }, "voice_get_file_missing_path");
      return null;
    }

    const env = loadEnv();
    const res = await fetch(fileDownloadUrl(env.TELEGRAM_BOT_TOKEN, file.file_path));

    if (!res.ok) {
      log.error({ file_id: fileId, status: res.status }, "voice_download_failed");
      return null;
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    const audioBase64 = buffer.toString("base64");

    const { text } = await transcribeAudio({
      audioBase64,
      mimeType: mimeType ?? DEFAULT_MIME_TYPE,
    });

    return text.trim();
  } catch (err) {
    log.error({ err, file_id: fileId }, "voice_transcription_failed");
    return null;
  }
}
