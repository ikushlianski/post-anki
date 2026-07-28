import type http from "node:http";
import { submitAttemptsInput, submitWritingCheckInput, updatePracticeSettingsInput } from "@post-anki/shared";
import { readJsonBody, sendError, sendJson } from "../shared/http.js";
import { getSubject } from "../subject/subject.repo.js";
import {
  getOrCreatePracticeSettings,
  updatePracticeSettings as updatePracticeSettingsRepo,
} from "./practice.repo.js";
import { generatePhraseBatch } from "./generate-phrase-batch.orchestrator.js";
import { gradeAttempts } from "./grade-attempts.orchestrator.js";
import { getPhraseBankSummary } from "./phrase-bank.repo.js";
import { gradeAndStoreWritingCheck } from "./writing-check.orchestrator.js";
import { getWritingChecksForSubject } from "./writing-check.repo.js";

async function requireLanguagePracticeSubject(
  res: http.ServerResponse,
  subjectId: string,
): Promise<boolean> {
  const subject = await getSubject(subjectId);

  if (!subject || subject.kind !== "language-practice") {
    sendError(res, 400, "not_a_language_practice_subject");
    return false;
  }

  return true;
}

export async function handleGetPracticeSettings(
  res: http.ServerResponse,
  subjectId: string,
): Promise<void> {
  if (!(await requireLanguagePracticeSubject(res, subjectId))) {
    return;
  }

  sendJson(res, 200, await getOrCreatePracticeSettings(subjectId));
}

export async function handleUpdatePracticeSettings(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  subjectId: string,
): Promise<void> {
  if (!(await requireLanguagePracticeSubject(res, subjectId))) {
    return;
  }

  const body = await readJsonBody(req, updatePracticeSettingsInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  sendJson(res, 200, await updatePracticeSettingsRepo(subjectId, body.data));
}

export async function handleCreatePhraseBatch(
  res: http.ServerResponse,
  subjectId: string,
): Promise<void> {
  if (!(await requireLanguagePracticeSubject(res, subjectId))) {
    return;
  }

  const settings = await getOrCreatePracticeSettings(subjectId);
  const rows = await generatePhraseBatch(subjectId, settings.level, settings.pack);

  sendJson(res, 200, { phrases: rows });
}

export async function handleCreateAttempts(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  subjectId: string,
): Promise<void> {
  if (!(await requireLanguagePracticeSubject(res, subjectId))) {
    return;
  }

  const body = await readJsonBody(req, submitAttemptsInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const settings = await getOrCreatePracticeSettings(subjectId);
  const { attempts, phraseBankUpdates } = await gradeAttempts(
    subjectId,
    settings.level,
    body.data.answers,
  );

  sendJson(res, 200, { attempts, phraseBankUpdates });
}

export async function handleGetPhraseBank(
  res: http.ServerResponse,
  subjectId: string,
): Promise<void> {
  if (!(await requireLanguagePracticeSubject(res, subjectId))) {
    return;
  }

  const settings = await getOrCreatePracticeSettings(subjectId);
  const summary = await getPhraseBankSummary(subjectId, settings.level, settings.pack);

  sendJson(res, 200, summary);
}

export async function handleCreateWritingCheck(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  subjectId: string,
): Promise<void> {
  if (!(await requireLanguagePracticeSubject(res, subjectId))) {
    return;
  }

  const body = await readJsonBody(req, submitWritingCheckInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const row = await gradeAndStoreWritingCheck(subjectId, body.data.text);

  sendJson(res, 200, row);
}

export async function handleListWritingChecks(
  res: http.ServerResponse,
  subjectId: string,
): Promise<void> {
  if (!(await requireLanguagePracticeSubject(res, subjectId))) {
    return;
  }

  sendJson(res, 200, await getWritingChecksForSubject(subjectId));
}
