import type {
  AnswerProbeSessionResult,
  AnswerSocraticResult,
  Curriculum,
  CurriculumDetail,
  DailyPushResponse,
  ProbeResult,
  ProbeScope,
  ProbeSession,
  QuestionKind,
  SocraticSession,
  Subject,
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

async function apiFetch<T>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const env = loadEnv();

  const res = await fetch(`${env.API_BASE_URL}${path}`, {
    method: init?.method ?? "GET",
    headers: headers(),
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

  if (!res.ok) {
    throw new Error(`${path} failed: ${res.status}`);
  }

  return (await res.json()) as T;
}

export function getSubjects(): Promise<Subject[]> {
  return apiFetch<Subject[]>("/subjects");
}

export function getCurricula(subjectId: string): Promise<Curriculum[]> {
  return apiFetch<Curriculum[]>(
    `/curricula?subjectId=${encodeURIComponent(subjectId)}`,
  );
}

export function getCurriculumDetail(id: string): Promise<CurriculumDetail> {
  return apiFetch<CurriculumDetail>(`/curricula/${encodeURIComponent(id)}`);
}

export function prepareProbeSession(input: {
  scope: ProbeScope;
  scopeId: string;
  regenerate?: boolean;
}): Promise<ProbeSession> {
  return apiFetch<ProbeSession>("/probe-sessions", {
    method: "POST",
    body: input,
  });
}

export function getActiveProbeSession(
  scope: ProbeScope,
  scopeId: string,
): Promise<ProbeSession | null> {
  return apiFetch<ProbeSession | null>(
    `/probe-sessions/active?scope=${scope}&scopeId=${encodeURIComponent(scopeId)}`,
  );
}

export function answerProbeSession(
  sessionId: string,
  input: { questionId: string; selectedIndex: number },
): Promise<AnswerProbeSessionResult> {
  return apiFetch<AnswerProbeSessionResult>(
    `/probe-sessions/${encodeURIComponent(sessionId)}/answer`,
    { method: "POST", body: input },
  );
}

export function startSocraticSession(input: {
  topicId: string;
  regenerate?: boolean;
}): Promise<SocraticSession> {
  return apiFetch<SocraticSession>("/socratic-sessions", {
    method: "POST",
    body: input,
  });
}

export function answerSocraticSession(
  sessionId: string,
  input: { turnId: string; answer: string },
): Promise<AnswerSocraticResult> {
  return apiFetch<AnswerSocraticResult>(
    `/socratic-sessions/${encodeURIComponent(sessionId)}/answer`,
    { method: "POST", body: input },
  );
}
