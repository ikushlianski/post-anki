import type {
  DailyPushResponse,
  ProbeResult,
  QuestionKind,
} from "@post-anki/shared";
import type { SubmitAnswerInput } from "../conversation/flow-types.js";
import { loadEnv } from "../env.js";

function headers(): Record<string, string> {
  const env = loadEnv();
  const h: Record<string, string> = { "content-type": "application/json" };

  if (env.API_SHARED_SECRET) {
    h.authorization = `Bearer ${env.API_SHARED_SECRET}`;
  }

  return h;
}

export async function getDailyPush(mode: QuestionKind): Promise<DailyPushResponse> {
  const env = loadEnv();

  const res = await fetch(`${env.API_BASE_URL}/daily-push?mode=${mode}`, {
    headers: headers(),
  });

  if (!res.ok) {
    throw new Error(`daily-push failed: ${res.status}`);
  }

  return (await res.json()) as DailyPushResponse;
}

export async function submitAnswer(input: SubmitAnswerInput): Promise<ProbeResult> {
  const env = loadEnv();

  const res = await fetch(
    `${env.API_BASE_URL}/topics/${input.topicId}/probe/answer`,
    {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        gapId: input.gapId,
        mode: input.mode,
        answer: input.answer,
      }),
    },
  );

  if (!res.ok) {
    throw new Error(`probe-answer failed: ${res.status}`);
  }

  return (await res.json()) as ProbeResult;
}
