import type { SubjectCheckRequest, SubjectCheckResponse, SubjectCheckUnavailableReason } from "@post-anki/shared";
import {
  SUBJECT_CHECK_OPERATION,
  SubjectCheckTimeoutError,
  runSubjectChecker,
} from "../mastra/knowledge-source-subject-checker.agent.js";
import { countRecentLlmCallEventsByOp } from "../llm-call-events/llm-call-events.repo.js";
import { embedTexts } from "../shared/embeddings-client.js";
import { log } from "../shared/log.js";
import {
  LlmBudgetCheckUnavailableError,
  LlmBudgetExceededError,
  assertLlmBudgetAvailable,
} from "../shared/spend-guard.js";
import {
  SUBJECT_CHECK_CANDIDATE_CAP,
  type SubjectCheckCandidate,
  buildCandidateSamples,
  scopeCandidatesToParent,
  shortlistCandidates,
} from "./knowledge-source-subject-check.candidates.js";
import { listSubjectCheckCandidateSet, listSubjectCheckSamples } from "./knowledge-source-subject-check.candidates.repo.js";
import {
  SUBJECT_CHECK_EMBED_CHARS,
  SUBJECT_CHECK_HOURLY_CAP,
  SUBJECT_CHECK_WINDOW_MS,
  isSubjectCheckEnabled,
} from "./knowledge-source-subject-check.config.js";
import { validateAdvice } from "./knowledge-source-subject-check.validate.js";

class UnavailableError extends Error {
  constructor(readonly reason: SubjectCheckUnavailableReason) {
    super(`subject_check_${reason}`);
  }
}

function unavailable(reason: SubjectCheckUnavailableReason): SubjectCheckResponse {
  return { status: "unavailable", reason };
}

function reasonFor(err: unknown): SubjectCheckUnavailableReason {
  if (err instanceof UnavailableError) {
    return err.reason;
  }

  if (err instanceof SubjectCheckTimeoutError) {
    return "timeout";
  }

  if (err instanceof LlmBudgetExceededError || err instanceof LlmBudgetCheckUnavailableError) {
    return "budget";
  }

  return "failed";
}

let inFlight = 0;

async function reserveHourlySlot(): Promise<void> {
  const used = await countRecentLlmCallEventsByOp(SUBJECT_CHECK_OPERATION, SUBJECT_CHECK_WINDOW_MS);

  if (used + inFlight >= SUBJECT_CHECK_HOURLY_CAP) {
    throw new UnavailableError("rate_limited");
  }

  inFlight += 1;
}

async function withSamples(shortlist: SubjectCheckCandidate[]): Promise<SubjectCheckCandidate[]> {
  const statements = await listSubjectCheckSamples(shortlist.map((entry) => entry.id));

  return shortlist.map((entry) => ({ ...entry, samples: buildCandidateSamples(statements.get(entry.id) ?? []) }));
}

async function embedExcerpt(blocks: SubjectCheckRequest["blocks"]): Promise<number[] | null> {
  const text = blocks.map((block) => block.value).join("\n").slice(0, SUBJECT_CHECK_EMBED_CHARS);

  try {
    const [first] = await embedTexts([{ id: "excerpt", text }]);

    return first?.embedding ?? null;
  } catch (err) {
    log.warn({ err }, "subject_check_embedding_failed");

    return null;
  }
}

export async function runSubjectCheck(request: SubjectCheckRequest): Promise<SubjectCheckResponse> {
  if (!isSubjectCheckEnabled()) {
    return unavailable("disabled");
  }

  let reserved = false;

  try {
    await reserveHourlySlot();
    reserved = true;
    await assertLlmBudgetAvailable();

    const set = await listSubjectCheckCandidateSet();
    const scoped = scopeCandidatesToParent(set.candidates, set.hierarchy, request.parentSubjectId);
    const queryEmbedding = scoped.length > SUBJECT_CHECK_CANDIDATE_CAP ? await embedExcerpt(request.blocks) : null;
    const shortlist = await withSamples(shortlistCandidates(scoped, queryEmbedding));
    const { output, aliases } = await runSubjectChecker(request.blocks, shortlist, set.parents);

    return validateAdvice(output, {
      aliases,
      hierarchy: set.hierarchy,
      parents: set.parents,
      scopeParentId: request.parentSubjectId,
    });
  } catch (err) {
    const reason = reasonFor(err);

    log.warn({ err, reason }, "subject_check_unavailable");

    return unavailable(reason);
  } finally {
    if (reserved) {
      inFlight -= 1;
    }
  }
}
