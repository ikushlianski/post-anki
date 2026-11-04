import { buildSubjectPathLabel } from "@post-anki/core";
import type { SubjectCheckNewSubject } from "@post-anki/shared";
import { countRecentLlmCallEventsByOp } from "../llm-call-events/llm-call-events.repo.js";
import { listSubjectCheckCandidateSet } from "../knowledge-source/knowledge-source-subject-check.candidates.repo.js";
import { runSubjectCreation, SUBJECT_CREATION_OPERATION } from "../mastra/subject-creation.agent.js";
import { embedTexts } from "../shared/embeddings-client.js";
import { log } from "../shared/log.js";
import { assertLlmBudgetAvailable } from "../shared/spend-guard.js";
import { SUBJECT_SUGGESTION_MAX_DEPTH } from "../subject-suggestion/subject-suggestion.config.js";
import { buildAssignmentBlocks } from "./subject-assignment.blocks.js";
import type { SourceAwaitingSubject } from "./subject-assignment.repo.js";
import type { SubjectProposal } from "./subject-assignment.select.js";
import {
  SUBJECT_CREATION_EXCERPT_CHARS,
  SUBJECT_CREATION_SUBJECT_CAP,
  SUBJECT_CREATION_WINDOW_MS,
  getSubjectAutoCreateDailyCap,
  isSubjectAutoCreateEnabled,
} from "./subject-creation.config.js";
import { createSubjectUnlessDuplicate } from "./subject-creation.repo.js";
import { subjectDepth, validateSubjectCreation, type ExistingSubject } from "./subject-creation.validate.js";

let inFlight = 0;

async function reserveDailySlot(): Promise<boolean> {
  const used = await countRecentLlmCallEventsByOp(SUBJECT_CREATION_OPERATION, SUBJECT_CREATION_WINDOW_MS);

  if (used + inFlight >= getSubjectAutoCreateDailyCap()) {
    return false;
  }

  inFlight += 1;

  return true;
}

async function embedExcerpt(excerpt: string): Promise<number[] | null> {
  try {
    const [first] = await embedTexts([{ id: "excerpt", text: excerpt }]);

    return first?.embedding ?? null;
  } catch (err) {
    log.warn({ err }, "subject_creation_embedding_failed");

    return null;
  }
}

async function loadSubjects(): Promise<{ subjects: ExistingSubject[]; offered: { id: string; label: string }[] }> {
  const set = await listSubjectCheckCandidateSet();
  const embeddings = new Map(set.candidates.map((candidate) => [candidate.id, candidate.embedding]));
  const subjects = set.hierarchy.map((row) => ({ ...row, embedding: embeddings.get(row.id) ?? null }));
  const offered = subjects
    .filter((subject) => (subjectDepth(subject.id, subjects) ?? SUBJECT_SUGGESTION_MAX_DEPTH) < SUBJECT_SUGGESTION_MAX_DEPTH)
    .sort((a, b) => (subjectDepth(a.id, subjects) ?? 0) - (subjectDepth(b.id, subjects) ?? 0))
    .slice(0, SUBJECT_CREATION_SUBJECT_CAP)
    .map((subject) => ({ id: subject.id, label: buildSubjectPathLabel(subject.id, set.hierarchy) }));

  return { subjects, offered };
}

async function createFromProposal(
  source: SourceAwaitingSubject,
  hint: SubjectCheckNewSubject,
): Promise<SubjectProposal | null> {
  await assertLlmBudgetAvailable();

  const excerpt = buildAssignmentBlocks(source)
    .map((block) => block.value)
    .join("\n")
    .slice(0, SUBJECT_CREATION_EXCERPT_CHARS);
  const { subjects, offered } = await loadSubjects();
  const { output, aliases } = await runSubjectCreation({
    excerpt,
    suggestedName: hint.name,
    suggestedParentLabel: hint.parentLabel,
    subjects: offered,
  });
  const decision = validateSubjectCreation(output, {
    subjects,
    aliases,
    sourceEmbedding: await embedExcerpt(excerpt),
  });

  if (!decision.create) {
    log.info({ sourceId: source.id, reason: decision.reason }, "subject_creation_declined");

    return null;
  }

  const subjectId = await createSubjectUnlessDuplicate({
    name: decision.name,
    parentId: decision.parentId,
    languageHint: hint.kind === "language",
  });

  if (subjectId === null) {
    log.info({ sourceId: source.id, reason: "duplicate_on_recheck" }, "subject_creation_declined");

    return null;
  }

  log.info({ sourceId: source.id, subjectId }, "subject_auto_created");

  return { subjectId, confidence: "medium" };
}

export async function createSubjectForSource(
  source: SourceAwaitingSubject,
  hint: SubjectCheckNewSubject,
): Promise<SubjectProposal | null> {
  if (!isSubjectAutoCreateEnabled()) {
    return null;
  }

  let reserved = false;

  try {
    reserved = await reserveDailySlot();

    if (!reserved) {
      log.info({ sourceId: source.id }, "subject_creation_daily_cap_reached");

      return null;
    }

    return await createFromProposal(source, hint);
  } catch (err) {
    log.warn({ err, sourceId: source.id }, "subject_creation_failed");

    return null;
  } finally {
    if (reserved) {
      inFlight -= 1;
    }
  }
}
