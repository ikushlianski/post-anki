import type { TranscribeAudioInput, TranscribeAudioResponse } from "@post-anki/shared";
import { apiFetch } from "../api/client";

export async function transcribeAudio(input: TranscribeAudioInput): Promise<TranscribeAudioResponse> {
  return apiFetch<TranscribeAudioResponse>("/transcriptions", {
    method: "POST",
    body: input,
  });
}
