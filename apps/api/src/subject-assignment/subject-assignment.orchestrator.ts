import type { SubjectCheckNewSubject } from "@post-anki/shared";
import { log } from "../shared/log.js";
import {
  runSubjectAssignmentEscalation,
  type EscalationNote,
  type EscalationSubject,
} from "../mastra/subject-assignment-escalation.agent.js";
import { shortlistCandidates } from "../knowledge-source/knowledge-source-subject-check.candidates.js";
import { listSubjectCheckCandidateSet } from "../knowledge-source/knowledge-source-subject-check.candidates.repo.js";
import { runSubjectCheck } from "../knowledge-source/knowledge-source-subject-check.orchestrator.js";
import { buildAssignmentBlocks } from "./subject-assignment.blocks.js";
import {
  SUBJECT_ASSIGNMENT_ESCALATION_EXCERPT_CHARS,
  SUBJECT_ASSIGNMENT_ESCALATION_SUBJECT_CAP,
  SUBJECT_ASSIGNMENT_SOURCE_CAP,
  isSubjectAssignmentEnabled,
} from "./subject-assignment.config.js";
import { validateEscalation } from "./subject-assignment.escalation-validate.js";
import {
  listSourcesAwaitingSubject,
  recordSubjectSuggestion,
  type SourceAwaitingSubject,
} from "./subject-assignment.repo.js";
import {
  classifyOutcome,
  needsEscalation,
  resolveFinalProposal,
  type SubjectProposal,
} from "./subject-assignment.select.js";
import { createSubjectForSource } from "./subject-creation.orchestrator.js";

export interface SubjectAssignmentScanResult {
  checked: number;
  escalated: number;
}

interface Unsettled {
  source: SourceAwaitingSubject;
  cheap: SubjectProposal | null;
  newSubject: SubjectCheckNewSubject | null;
}

async function escalateBatch(unsettled: Unsettled[]): Promise<Map<string, SubjectProposal | null>> {
  const set = await listSubjectCheckCandidateSet();
  const subjects: EscalationSubject[] = shortlistCandidates(
    set.candidates,
    null,
    SUBJECT_ASSIGNMENT_ESCALATION_SUBJECT_CAP,
  ).map((candidate) => ({ id: candidate.id, label: candidate.label }));
  const notes: EscalationNote[] = unsettled.map(({ source }) => ({
    sourceId: source.id,
    excerpt: buildAssignmentBlocks(source)
      .map((block) => block.value)
      .join("\n")
      .slice(0, SUBJECT_ASSIGNMENT_ESCALATION_EXCERPT_CHARS),
  }));
  const { output, prompt } = await runSubjectAssignmentEscalation(notes, subjects);

  return validateEscalation(output, prompt);
}

async function escalateSafely(unsettled: Unsettled[]): Promise<Map<string, SubjectProposal | null>> {
  try {
    return await escalateBatch(unsettled);
  } catch (err) {
    log.warn({ err }, "subject_assignment_escalation_failed");

    return new Map();
  }
}

export async function runSubjectAssignmentScan(): Promise<SubjectAssignmentScanResult> {
  if (!isSubjectAssignmentEnabled()) {
    return { checked: 0, escalated: 0 };
  }

  const sources = await listSourcesAwaitingSubject(SUBJECT_ASSIGNMENT_SOURCE_CAP);
  const unsettled: Unsettled[] = [];
  let checked = 0;

  for (const source of sources) {
    const blocks = buildAssignmentBlocks(source);

    if (blocks.length === 0) {
      await recordSubjectSuggestion(source.id, null);
      checked += 1;
      continue;
    }

    const response = await runSubjectCheck({ blocks });
    const outcome = classifyOutcome(response);

    if (outcome.kind === "stop") {
      break;
    }

    if (needsEscalation(outcome)) {
      unsettled.push({
        source,
        cheap: outcome.kind === "proposal" ? outcome.proposal : null,
        newSubject: response.status === "ok" ? response.newSubject : null,
      });
      continue;
    }

    await recordSubjectSuggestion(source.id, outcome.kind === "proposal" ? outcome.proposal : null);
    checked += 1;
  }

  if (unsettled.length > 0) {
    const escalated = await escalateSafely(unsettled);

    for (const { source, cheap, newSubject } of unsettled) {
      const confirmedNoFit = escalated.has(source.id) && escalated.get(source.id) === null;
      const created = confirmedNoFit && newSubject ? await createSubjectForSource(source, newSubject) : null;

      await recordSubjectSuggestion(source.id, created ?? resolveFinalProposal(cheap, escalated.get(source.id)));
      checked += 1;
    }
  }

  return { checked, escalated: unsettled.length };
}
