import type { InboxSummary } from "../inbox/inbox-command.js";
import {
  motivationSettingsSchema,
  ownerStatsLearningSchema,
  rejectedCardsPageSchema,
  searchResponseSchema,
  reviewCardsResponseSchema,
  weeklyDigestCardSchema,
} from "@post-anki/shared";
import type {
  AnswerProbeSessionResult,
  AnswerSocraticResult,
  CheckSessionIdleResult,
  ChatQueueKnowledgeBitList,
  CompleteSocraticSessionResult,
  Curriculum,
  CurriculumDetail,
  DailyPushResponse,
  DueQueueResponse,
  GapsDueForResurfaceResponse,
  OwnerStatsLearning,
  InboxKnowledgeBitList,
  ProbeResult,
  ProbeScope,
  ProbeSession,
  KnowledgeBitFeedbackReason,
  QuestionKind,
  ReviewCounts,
  SearchResponse,
  RejectedCardsPage,
  ResurfaceKind,
  SocraticSession,
  StaleChatQueueSummary,
  Subject,
  TranscribeAudioInput,
  TranscribeAudioResponse,
  TriageAction,
  TriageGapResultDto,
  WeeklyDigestCard,
} from "@post-anki/shared";

const QUICK_STUDIES_SUBJECT_NAME = "Quick Studies";
import type { SubmitAnswerInput } from "../conversation/flow-types.js";
import { loadEnv } from "../env.js";
import { assertSecureUrl } from "./secure-url.js";

export const API_TIMEOUT_MS = 20_000;

export const LLM_API_TIMEOUT_MS = 90_000;

export function apiTimeoutSignal(timeoutMs: number = API_TIMEOUT_MS): AbortSignal {
  return AbortSignal.timeout(timeoutMs);
}

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

  assertSecureUrl(env.API_BASE_URL);

  const res = await fetch(`${env.API_BASE_URL}/daily-push?mode=${mode}`, {
    headers: headers(),
    signal: apiTimeoutSignal(LLM_API_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`daily-push failed: ${res.status}`);
  }

  return (await res.json()) as DailyPushResponse;
}

export async function submitAnswer(input: SubmitAnswerInput): Promise<ProbeResult> {
  const env = loadEnv();

  assertSecureUrl(env.API_BASE_URL);

  const res = await fetch(
    `${env.API_BASE_URL}/topics/${input.topicId}/probe/answer`,
    {
      method: "POST",
      headers: headers(),
      signal: apiTimeoutSignal(LLM_API_TIMEOUT_MS),
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
  init?: { method?: string; body?: unknown; timeoutMs?: number },
): Promise<T> {
  const env = loadEnv();

  assertSecureUrl(env.API_BASE_URL);

  const res = await fetch(`${env.API_BASE_URL}${path}`, {
    method: init?.method ?? "GET",
    headers: headers(),
    signal: apiTimeoutSignal(init?.timeoutMs),
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

export async function getOrCreateQuickStudiesSubject(): Promise<Subject> {
  const subjects = await getSubjects();
  const existing = subjects.find((s) => s.name === QUICK_STUDIES_SUBJECT_NAME);

  if (existing) {
    return existing;
  }

  return apiFetch<Subject>("/subjects", {
    method: "POST",
    body: { name: QUICK_STUDIES_SUBJECT_NAME },
  });
}

export async function createStudyCurriculum(
  subjectId: string,
  technologyName: string,
): Promise<void> {
  await apiFetch<Curriculum>("/curricula", {
    method: "POST",
    timeoutMs: LLM_API_TIMEOUT_MS,
    body: {
      subjectId,
      name: technologyName,
      sources: [],
      researchTopic: technologyName,
    },
  });
}

export function prepareProbeSession(input: {
  scope: ProbeScope;
  scopeId: string;
  regenerate?: boolean;
}): Promise<ProbeSession> {
  return apiFetch<ProbeSession>("/probe-sessions", {
    method: "POST",
    timeoutMs: LLM_API_TIMEOUT_MS,
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
    timeoutMs: LLM_API_TIMEOUT_MS,
    body: input,
  });
}

export function answerSocraticSession(
  sessionId: string,
  input: { turnId: string; answer: string },
): Promise<AnswerSocraticResult> {
  return apiFetch<AnswerSocraticResult>(
    `/socratic-sessions/${encodeURIComponent(sessionId)}/answer`,
    { method: "POST", body: input, timeoutMs: LLM_API_TIMEOUT_MS },
  );
}

export function checkSocraticSessionIdle(
  sessionId: string,
): Promise<CheckSessionIdleResult> {
  return apiFetch<CheckSessionIdleResult>(
    `/socratic-sessions/${encodeURIComponent(sessionId)}/check-idle`,
    { method: "POST", timeoutMs: LLM_API_TIMEOUT_MS },
  );
}

export function completeSocraticSessionNow(
  sessionId: string,
): Promise<CompleteSocraticSessionResult> {
  return apiFetch<CompleteSocraticSessionResult>(
    `/socratic-sessions/${encodeURIComponent(sessionId)}/complete`,
    { method: "POST", timeoutMs: LLM_API_TIMEOUT_MS },
  );
}

export function triageGap(gapId: string, action: TriageAction): Promise<TriageGapResultDto> {
  return apiFetch<TriageGapResultDto>(`/gaps/${encodeURIComponent(gapId)}/triage`, {
    method: "POST",
    body: { action },
  });
}

export function getGapsDueForResurface(): Promise<GapsDueForResurfaceResponse> {
  return apiFetch<GapsDueForResurfaceResponse>("/gaps/due-for-resurface");
}

export function getStaleChatQueueSummary(): Promise<StaleChatQueueSummary> {
  return apiFetch<StaleChatQueueSummary>("/knowledge-bits/chat-queue/stale");
}

export async function getInboxSummary(): Promise<InboxSummary> {
  const list = await apiFetch<
    Pick<InboxKnowledgeBitList, "count" | "total" | "hasMore"> & { items?: unknown[] }
  >("/knowledge-bits/inbox");

  return {
    count: list.count,
    shown: list.items?.length ?? list.count,
    total: list.total,
    hasMore: list.hasMore,
  };
}

export function getChatQueue(): Promise<ChatQueueKnowledgeBitList> {
  return apiFetch<ChatQueueKnowledgeBitList>("/knowledge-bits/chat-queue");
}

export async function searchEverything(query: string): Promise<SearchResponse> {
  return searchResponseSchema.parse(await apiFetch<unknown>(`/search?q=${encodeURIComponent(query)}`));
}

export async function getWeeklyDigest(): Promise<WeeklyDigestCard> {
  return weeklyDigestCardSchema.parse(await apiFetch<unknown>("/analytics/weekly-digest"));
}

export async function getRejectedCards(input: {
  limit: number;
  reason?: KnowledgeBitFeedbackReason;
  q?: string;
}): Promise<RejectedCardsPage> {
  const params = new URLSearchParams({ limit: String(input.limit) });

  if (input.reason) params.set("reason", input.reason);

  if (input.q) params.set("q", input.q);

  return rejectedCardsPageSchema.parse(
    await apiFetch<unknown>(`/knowledge-bits/rejected?${params.toString()}`),
  );
}

export function getDueQueue(): Promise<DueQueueResponse> {
  return apiFetch<DueQueueResponse>("/due-queue");
}

export function markGapResurfaced(gapId: string, kind: ResurfaceKind): Promise<void> {
  return apiFetch<void>(`/gaps/${encodeURIComponent(gapId)}/mark-resurfaced`, {
    method: "POST",
    body: { kind },
  });
}

export function transcribeAudio(input: TranscribeAudioInput): Promise<TranscribeAudioResponse> {
  return apiFetch<TranscribeAudioResponse>("/transcriptions", {
    method: "POST",
    timeoutMs: LLM_API_TIMEOUT_MS,
    body: input,
  });
}

export async function getReviewCounts(): Promise<ReviewCounts> {
  const tz = encodeURIComponent(await getMotivationTimeZone());
  const body = await apiFetch<unknown>(`/knowledge-bits/review-cards?limit=1&tz=${tz}`);

  return reviewCardsResponseSchema.pick({ counts: true }).parse(body).counts;
}

export async function getLearningStats(): Promise<OwnerStatsLearning> {
  const tz = encodeURIComponent(await getMotivationTimeZone());

  return ownerStatsLearningSchema.parse(await apiFetch<unknown>(`/stats/learning?tz=${tz}&days=7`));
}

const TIME_ZONE_TTL_MS = 10 * 60 * 1000;
let cachedTimeZone: { value: string; expiresAt: number } | null = null;

export function resetMotivationTimeZoneCache(): void {
  cachedTimeZone = null;
}

export async function getMotivationTimeZone(now: number = Date.now()): Promise<string> {
  if (cachedTimeZone && cachedTimeZone.expiresAt > now) {
    return cachedTimeZone.value;
  }

  try {
    const body = await apiFetch<unknown>("/motivation/settings");
    const parsed = motivationSettingsSchema.pick({ timeZone: true }).parse(body);

    cachedTimeZone = { value: parsed.timeZone, expiresAt: now + TIME_ZONE_TTL_MS };

    return parsed.timeZone;
  } catch {
    return "UTC";
  }
}
