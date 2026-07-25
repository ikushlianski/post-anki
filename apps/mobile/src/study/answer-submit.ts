import type { ProbeResult, SubmitProbeInput } from "@post-anki/shared";
import { apiFetch } from "../api/client";

export async function submitProbeAnswer(input: SubmitProbeInput): Promise<ProbeResult> {
  return apiFetch<ProbeResult>(`/topics/${input.topicId}/probe/answer`, {
    method: "POST",
    body: input,
  });
}
