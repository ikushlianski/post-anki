import pRetry from "p-retry";
import type { Curriculum, SplitSuggestion, StructureSnapshot } from "@post-anki/shared";
import { STALE_PENDING_TURN_AGE_MS, estimateStructureStudyTime } from "@post-anki/core";
import { RequestContext } from "@mastra/core/request-context";
import { getMastra, AGENT_KEYS } from "../mastra/mastra.js";
import { log } from "../shared/log.js";
import { recordLlmCallEvent } from "../llm-call-events/llm-call-events.repo.js";
import type { StructureEditorToolsDeps } from "../mastra/structure-editor-tools.js";
import { docResearchPlanSchema } from "./curriculum-research-plan.js";
import {
  gatherTrustedSourceCandidates,
  type TrustedSourceCandidate,
} from "./tech-research-grounding.js";
import {
  buildStructureDraftPrompt,
  buildStructureGuidedRegenPrompt,
  buildStructureToolTurnPrompt,
  type TrustedSourceRef,
} from "./curriculum-prompt.js";
import {
  getCurriculum,
  getCurriculumPromptContext,
  getLatestPendingResearchCandidates,
  getLatestStructureSnapshot,
  getStructureTurns,
  insertStructureResearchCandidates,
  insertStructureTurn,
  maxModuleOrder,
  saveCurriculumPlan,
  setCurriculumStatus,
  setCurriculumStrictOrder,
  setResearchCandidateStatuses,
  updateStructureTurn,
} from "./curriculum.repo.js";
import { assembleAllSourceText } from "./source-text.js";
import { listTags } from "../tag/tag.repo.js";

// Every real network/model call this module makes to an LLM agent goes
// through this one retry wrapper — bounded (2 retries, 3 attempts total)
// with p-retry's default exponential backoff. Scoped strictly to the
// generate() call itself, never to the surrounding orchestration: retrying
// the whole turn would risk re-running tool side effects that already
// landed (e.g. `splitModuleIntoNewCourse` creating a real new curriculum
// row) a second time, which is exactly the failure mode
// `structure-editor-tools.ts`'s safety boundary comment warns about.
const AGENT_GENERATE_RETRIES = 2;

/**
 * `recordLlmCallEvent` already catches its own DB-write failures (see
 * llm-call-events.repo.ts) — this second layer of defense exists purely so
 * that a bug in that guarantee, or any other unexpected rejection from the
 * observability call itself, can never surface as a `generateWithRetry`
 * failure. Observability plumbing must never break or mask the actual
 * LLM-call result.
 */
async function safeRecordLlmCallEvent(
  input: Parameters<typeof recordLlmCallEvent>[0],
): Promise<void> {
  try {
    await recordLlmCallEvent(input);
  } catch (err) {
    log.warn(
      { err, op: input.op, curriculumId: input.curriculumId },
      "llm_call_event_record_failed",
    );
  }
}

async function generateWithRetry<T>(
  op: string,
  curriculumId: string,
  agentKey: string,
  fn: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();

  let result: T;

  try {
    result = await pRetry(fn, {
      retries: AGENT_GENERATE_RETRIES,
      onFailedAttempt: ({ error, attemptNumber, retriesLeft }) => {
        log.warn(
          { curriculumId, op, attempt: attemptNumber, retriesLeft, err: error },
          "structure_agent_generate_retry",
        );
      },
    });
  } catch (err) {
    // Written AFTER the whole retry sequence throws — reflects the final
    // outcome of this `generateWithRetry` call, not each individual
    // attempt (per-attempt detail already exists via `onFailedAttempt`'s
    // pino log above; duplicating it at the DB layer would just grow the
    // table for no new information).
    await safeRecordLlmCallEvent({
      curriculumId,
      op,
      agentKey,
      durationMs: Date.now() - startedAt,
      success: false,
      errorMessage: err instanceof Error ? err.message : String(err),
    });

    throw err;
  }

  await safeRecordLlmCallEvent({
    curriculumId,
    op,
    agentKey,
    durationMs: Date.now() - startedAt,
    success: true,
    errorMessage: null,
  });

  return result;
}

// Postgres's SQLSTATE for a unique-violation — surfaces here as the raw `pg`
// driver error (drizzle-orm's node-postgres session rethrows it unchanged),
// carrying a `.code` property. This is what
// `curriculum_structure_turns_pending_assistant_unique` (see schema.ts) hits
// when two concurrent calls both try to insert a pending assistant
// placeholder for the same curriculum — the real DB-level guarantee behind
// the concurrency guard below, since a check-then-act read in application
// code would just re-implement the same race.
const POSTGRES_UNIQUE_VIOLATION = "23505";

function isPendingTurnConflict(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === POSTGRES_UNIQUE_VIOLATION
  );
}

// How old a pending assistant turn has to be before this self-heal will
// touch it — well above the longest a real in-flight turn could plausibly
// still be running (`MAX_TOOL_STEPS` worth of tool calls plus
// `generateWithRetry`'s retries under slow network conditions). Without
// this floor, `finalizeStalePendingTurn` would flip a genuinely live
// concurrent turn (the second tab/request in the exact race
// `submitStructureTurn`'s pending-placeholder unique index exists to
// guard against) to "failed" before that second call ever reaches the
// index — freeing the one slot the index enforces and letting both turns
// proceed to edit the same prior snapshot. A crash is still healed; it's
// just healed once it's actually old enough to be a crash and not a turn
// still doing real work.

/**
 * Self-healing for a turn that was left "pending" by a process that
 * crashed or was killed mid-turn (see `submitStructureTurn`'s placeholder
 * write below) — called at the start of the NEXT turn for this curriculum,
 * since that is the simplest point at which "this attempt never resolved"
 * is knowable without a resume-in-place mechanism. A turn still pending
 * from the CURRENT call is never affected — only ever the immediately
 * prior one, and only once it's older than `STALE_PENDING_TURN_AGE_MS`
 * (see that constant for why the age check exists).
 */
async function finalizeStalePendingTurn(curriculumId: string): Promise<void> {
  const turns = await getStructureTurns(curriculumId);
  const last = turns[turns.length - 1];

  if (!last || last.role !== "assistant" || last.status !== "pending") {
    return;
  }

  const ageMs = Date.now() - new Date(last.createdAt).getTime();

  if (ageMs < STALE_PENDING_TURN_AGE_MS) {
    return;
  }

  await updateStructureTurn(last.id, {
    message: "That last reply didn't complete — please resend your message.",
    status: "failed",
  });
}

/**
 * The first architect-agent call in a curriculum's structure-shaping stage
 * (Phase 5) — called once the learner has approved sources (bare
 * name/docUrl path) or immediately for pasted material. Always preceded by
 * a trusted-source web search. Produces a draft, stores it as the first
 * assistant turn, and lands the curriculum on "shaping_structure" for
 * conversational review — never straight to "ready".
 */
export async function generateDraftStructure(curriculumId: string): Promise<void> {
  // Written before anything else — including before the curriculum/context
  // lookups below — so ANY failure in this function, not just an agent
  // failure, leaves a durable trace in `curriculum_structure_turns`. That
  // trace is what lets the frontend (via `hasAnyStructureTurns`) tell a
  // Phase 5 draft-generation failure apart from an old pre-Phase-5
  // research/parse failure, which never reaches this function at all.
  let placeholderId: string;

  try {
    placeholderId = await insertStructureTurn(curriculumId, {
      role: "assistant",
      message: "Drafting the first version of the structure…",
      structureSnapshot: null,
      status: "pending",
    });
  } catch (err) {
    if (isPendingTurnConflict(err)) {
      // Another draft-generation attempt for this same curriculum is
      // already in flight and owns the one allowed pending placeholder —
      // nothing for this call to do but back off, since writing anything
      // else here would race with whichever attempt is already resolving
      // that row.
      log.warn({ curriculumId }, "structure_draft_generation_already_in_progress");
      return;
    }

    throw err;
  }

  await setCurriculumStatus(curriculumId, "shaping_structure");

  try {
    const curriculum = await getCurriculum(curriculumId);

    if (!curriculum) {
      throw new Error("curriculum not found for draft structure generation");
    }

    const ctx = await getCurriculumPromptContext(curriculumId);

    if (!ctx) {
      throw new Error("curriculum context not found for draft structure generation");
    }

    const [sourceText, trustedSources, existingTags] = await Promise.all([
      assembleAllSourceText(curriculumId),
      gatherTrustedSourceCandidates(curriculum.name, { curriculumId, subjectId: curriculum.subjectId }).catch((err) => {
        log.warn({ err, curriculumId }, "structure_draft_trusted_search_failed");
        return [];
      }),
      listTags().then((tags) => tags.map((t) => t.name)),
    ]);

    const prompt = buildStructureDraftPrompt(ctx, sourceText, trustedSources, existingTags);
    const agent = getMastra().getAgent(AGENT_KEYS.docResearchArchitect);

    const result = await generateWithRetry(
      "generateDraftStructure",
      curriculumId,
      AGENT_KEYS.docResearchArchitect,
      () =>
        agent.generate(prompt, {
          structuredOutput: { schema: docResearchPlanSchema },
          requestContext: new RequestContext([["curriculumId", curriculumId]]),
        }),
    );

    if (!result.object) {
      throw new Error("doc-research architect returned no structured draft");
    }

    await updateStructureTurn(placeholderId, {
      message: "Here's a first draft of the course structure — flag anything you're unsure about, or just tell me what to change.",
      structureSnapshot: result.object,
      status: "complete",
    });

    await setCurriculumStatus(curriculumId, "shaping_structure");

    log.info(
      { curriculumId, modules: result.object.modules.length },
      "structure_draft_generated",
    );
  } catch (err) {
    log.error({ err, curriculumId }, "structure_draft_generation_failed");

    await updateStructureTurn(placeholderId, {
      message: "The mentor couldn't draft a structure for this course.",
      status: "failed",
    });
    await setCurriculumStatus(curriculumId, "failed");
  }
}

/**
 * Recovery for a `generateDraftStructure` failure specifically — re-runs
 * only the draft-generation step, not the legacy `parseCurriculum`/
 * `researchCurriculum` restart (`retryResearch`/`reparseCurriculum`), since
 * those throw away already-approved sources/pasted material for a failure
 * that has nothing to do with sourcing. Sources are already stored, so
 * this needs no input beyond the curriculum id.
 */
export async function retryDraftStructure(curriculumId: string): Promise<void> {
  await finalizeStalePendingTurn(curriculumId);
  await generateDraftStructure(curriculumId);
}

export interface SubmitStructureTurnInput {
  message: string;
  researchGapLabels?: string[];
}

// Mastra's structured-output mode and tool-calling mode don't compose on
// the same generate() call — a tool-calling turn's iteration count is
// capped here, in code, not left to prompt instructions (per this repo's
// agent-development principles' "hard limiters must be in code" rule).
// Generous enough for a real multi-step edit (e.g. "merge these two, then
// split module three into its own course"), small enough that a runaway
// loop is cheap to notice in logs.
const MAX_TOOL_STEPS = 8;

// A hard cap on how long a structure-shaping conversation can run — in
// code, not a prompt instruction, for the same reason `MAX_TOOL_STEPS`
// above is. Counts every row in `curriculum_structure_turns` for the
// curriculum (user turns and assistant turns combined). Generous enough
// for a genuinely long back-and-forth, small enough that an unbounded
// conversation can't grow the table or the per-turn prompt context
// forever for a single curriculum.
const MAX_STRUCTURE_TURNS = 40;

export type SubmitStructureTurnResult =
  | { ok: true }
  | { ok: false; code: "turn_in_progress" | "turn_limit_reached" };

function studyTimeSummary(snapshot: StructureSnapshot): string {
  const estimate = estimateStructureStudyTime(snapshot.modules);

  return `roughly ${estimate.estimatedWeeks} week(s) — ${estimate.totalTopics} topics across ${estimate.totalModules} modules (target: 4-8 weeks)`;
}

/**
 * One chat turn: records the learner's message, then either (a) hands the
 * turn straight to the tool-calling structure-editor agent (no
 * `researchGapLabels` flagged, or the supplemental search below turned up
 * nothing to review), or (b) when the learner flagged modules/topics for
 * "more research", gathers SUPPLEMENTAL trusted-source candidates and stops
 * — surfacing them for explicit approve/reject review
 * (`resolveSupplementalResearch` is what actually resumes the edit — see
 * that function) rather than feeding them straight into the agent's prompt.
 * The always-on trusted-source search (`gatherTrustedSourceCandidates(
 * curriculum.name)`, unrelated to `researchGapLabels`) is untouched by this
 * gate and always runs as part of the edit itself. Never throws to the
 * caller — a failed turn still appends an assistant turn (carrying the
 * unchanged prior snapshot) so the chat itself never breaks. The two guard
 * cases below (turn limit, a turn already in progress) are the exception:
 * neither writes an assistant turn at all, and both are reported back via
 * the returned result rather than a thrown error, so the controller can
 * turn them into a clean 409 instead of a generic failure.
 */
export async function submitStructureTurn(
  curriculumId: string,
  input: SubmitStructureTurnInput,
): Promise<SubmitStructureTurnResult> {
  const existingTurns = await getStructureTurns(curriculumId);

  if (existingTurns.length >= MAX_STRUCTURE_TURNS) {
    log.warn(
      { curriculumId, turnCount: existingTurns.length },
      "structure_turn_limit_reached",
    );

    return { ok: false, code: "turn_limit_reached" };
  }

  // Self-heal a prior turn a crashed process left stuck "pending" BEFORE
  // this turn adds anything of its own — see `finalizeStalePendingTurn`.
  await finalizeStalePendingTurn(curriculumId);

  await insertStructureTurn(curriculumId, {
    role: "user",
    message: input.message,
    structureSnapshot: null,
  });

  const priorSnapshotForFallback = await getLatestStructureSnapshot(curriculumId);
  const pendingTurnId = await insertPendingAssistantTurn(curriculumId);

  if (typeof pendingTurnId !== "string") {
    return pendingTurnId;
  }

  const researchGapLabels = input.researchGapLabels ?? [];

  if (researchGapLabels.length > 0) {
    return surfaceSupplementalResearchCandidates(
      curriculumId,
      pendingTurnId,
      priorSnapshotForFallback,
      researchGapLabels,
    );
  }

  return runStructureEditorEdit(curriculumId, pendingTurnId, priorSnapshotForFallback, [], []);
}

/**
 * Writes this turn's "pending" assistant placeholder — shared by
 * `submitStructureTurn` and `resolveSupplementalResearch`, since both insert
 * exactly one such placeholder per call and both need the SAME
 * turn-in-progress translation (a unique-violation on the
 * `curriculum_structure_turns_pending_assistant_unique` index becomes
 * `{ ok: false, code: "turn_in_progress" }` rather than a thrown error).
 * Returns the new row's id on success, or the guard result to return
 * as-is on conflict.
 */
async function insertPendingAssistantTurn(
  curriculumId: string,
): Promise<string | SubmitStructureTurnResult> {
  try {
    return await insertStructureTurn(curriculumId, {
      role: "assistant",
      message: "Working on it…",
      structureSnapshot: null,
      status: "pending",
    });
  } catch (err) {
    if (isPendingTurnConflict(err)) {
      log.warn({ curriculumId }, "structure_turn_already_in_progress");

      return { ok: false, code: "turn_in_progress" };
    }

    throw err;
  }
}

/**
 * Step 1 of the supplemental-research review gate: runs the SUPPLEMENTAL
 * trusted-source search for the flagged labels and finalizes THIS turn with
 * the results — never calling the structure-editor agent in this same call.
 * If the search turns up nothing to review, there is nothing to gate on, so
 * this falls through to the normal edit path exactly as if
 * `researchGapLabels` had been empty. Otherwise the candidates are persisted
 * against this turn id (`insertStructureResearchCandidates`) and the turn's
 * `pendingResearchCandidates` (assembled by `getStructureTurns` from that
 * table) is what the frontend renders its approve/reject UI from.
 */
async function surfaceSupplementalResearchCandidates(
  curriculumId: string,
  pendingTurnId: string,
  priorSnapshotForFallback: StructureSnapshot | null,
  researchGapLabels: string[],
): Promise<SubmitStructureTurnResult> {
  try {
    const curriculum = await getCurriculum(curriculumId);

    if (!curriculum) {
      throw new Error("curriculum not found for structure turn");
    }

    const candidates = await gatherTrustedSourceCandidates(
      `${curriculum.name}: ${researchGapLabels.join(", ")}`,
      { curriculumId, subjectId: curriculum.subjectId },
    ).catch((err) => {
      log.warn({ err, curriculumId, researchGapLabels }, "structure_turn_supplemental_search_failed");
      return [] as TrustedSourceCandidate[];
    });

    if (candidates.length === 0) {
      return runStructureEditorEdit(curriculumId, pendingTurnId, priorSnapshotForFallback, [], []);
    }

    const label = researchGapLabels.join(", ");

    await insertStructureResearchCandidates(curriculumId, pendingTurnId, label, candidates);

    await updateStructureTurn(pendingTurnId, {
      message: `Found ${candidates.length} source${candidates.length === 1 ? "" : "s"} for "${label}" — review them below before I make the edit.`,
      structureSnapshot: priorSnapshotForFallback,
      status: "complete",
    });

    log.info(
      { curriculumId, researchGapLabels, candidateCount: candidates.length },
      "structure_turn_supplemental_research_surfaced",
    );

    return { ok: true };
  } catch (err) {
    log.error({ err, curriculumId }, "structure_turn_supplemental_research_failed");

    await updateStructureTurn(pendingTurnId, {
      message: "I couldn't gather additional sources just now — try sending that again.",
      structureSnapshot: priorSnapshotForFallback,
      status: "failed",
    });

    return { ok: true };
  }
}

export interface ResolveSupplementalResearchInput {
  approvedCandidateIds: string[];
}

/**
 * Step 2 of the supplemental-research review gate: the learner's decision on
 * whatever `surfaceSupplementalResearchCandidates` most recently surfaced
 * for this curriculum. An empty `approvedCandidateIds` means "skip these" —
 * every surfaced candidate is rejected and the edit proceeds using only the
 * always-on trusted-source search, functionally identical to a normal
 * `submitStructureTurn` call with no `researchGapLabels`. Re-enters the SAME
 * turn-in-progress/turn-limit guards `submitStructureTurn` does, since this
 * call also inserts a pending assistant placeholder and calls the LLM.
 *
 * Takes no `originalMessage` — unlike a normal turn, this call adds no new
 * user message of its own; the learner's original request is already the
 * most recent user turn in history, which `runStructureEditorEdit` includes
 * in the prompt via `getStructureTurns` same as any other turn.
 */
export async function resolveSupplementalResearch(
  curriculumId: string,
  input: ResolveSupplementalResearchInput,
): Promise<SubmitStructureTurnResult> {
  const existingTurns = await getStructureTurns(curriculumId);

  if (existingTurns.length >= MAX_STRUCTURE_TURNS) {
    log.warn(
      { curriculumId, turnCount: existingTurns.length },
      "structure_turn_limit_reached",
    );

    return { ok: false, code: "turn_limit_reached" };
  }

  await finalizeStalePendingTurn(curriculumId);

  const pendingBatch = await getLatestPendingResearchCandidates(curriculumId);
  const approvedIds = new Set(input.approvedCandidateIds);
  const approvedCandidates = pendingBatch.filter((c) => approvedIds.has(c.id));
  const rejectedCandidates = pendingBatch.filter((c) => !approvedIds.has(c.id));

  await Promise.all([
    setResearchCandidateStatuses(approvedCandidates.map((c) => c.id), "approved"),
    setResearchCandidateStatuses(rejectedCandidates.map((c) => c.id), "rejected"),
  ]);

  const researchGapLabels = Array.from(new Set(approvedCandidates.map((c) => c.label)));
  const supplementalSources = approvedCandidates.map((c) => ({ url: c.value, title: c.title }));

  const priorSnapshotForFallback = await getLatestStructureSnapshot(curriculumId);
  const pendingTurnId = await insertPendingAssistantTurn(curriculumId);

  if (typeof pendingTurnId !== "string") {
    return pendingTurnId;
  }

  return runStructureEditorEdit(
    curriculumId,
    pendingTurnId,
    priorSnapshotForFallback,
    researchGapLabels,
    supplementalSources,
  );
}

/**
 * The actual tool-calling structure-editor call, shared by
 * `submitStructureTurn` (when there's nothing to gate on) and
 * `resolveSupplementalResearch` (once the learner has approved/rejected
 * whatever was surfaced). `pendingTurnId` must already exist as a "pending"
 * assistant placeholder — this finalizes that SAME row, never inserting a
 * second one. `researchGapLabels`/`supplementalSources` are already resolved
 * by the caller — empty arrays here read identically to a turn that never
 * had any research flagged at all.
 */
async function runStructureEditorEdit(
  curriculumId: string,
  pendingTurnId: string,
  priorSnapshotForFallback: StructureSnapshot | null,
  researchGapLabels: string[],
  supplementalSources: TrustedSourceRef[],
): Promise<SubmitStructureTurnResult> {
  try {
    const curriculum = await getCurriculum(curriculumId);

    if (!curriculum) {
      throw new Error("curriculum not found for structure turn");
    }

    const ctx = await getCurriculumPromptContext(curriculumId);

    if (!ctx) {
      throw new Error("curriculum context not found for structure turn");
    }

    const [sourceText, allTurns, trustedSources, existingTags] = await Promise.all([
      assembleAllSourceText(curriculumId),
      getStructureTurns(curriculumId),
      gatherTrustedSourceCandidates(curriculum.name, { curriculumId, subjectId: curriculum.subjectId }).catch((err) => {
        log.warn({ err, curriculumId }, "structure_turn_trusted_search_failed");
        return [];
      }),
      listTags().then((tags) => tags.map((t) => t.name)),
    ]);

    // Excludes this very turn's own "pending" placeholder, inserted above
    // — it carries no real content yet and must never appear in the
    // conversation history handed to the agent.
    const turns = allTurns.filter((t) => t.id !== pendingTurnId);

    const priorSnapshot = [...turns].reverse().find((t) => t.structureSnapshot)?.structureSnapshot ?? null;

    if (!priorSnapshot) {
      throw new Error("no prior structure snapshot to edit");
    }

    const state = {
      snapshot: priorSnapshot,
      splitSuggestion: null as SplitSuggestion | null,
      toolActions: [] as string[],
    };

    const regenerateGuided = async (guidance: string): Promise<StructureSnapshot | null> => {
      const regenPrompt = buildStructureGuidedRegenPrompt(
        ctx,
        sourceText,
        trustedSources,
        state.snapshot,
        guidance,
        existingTags,
      );
      const architect = getMastra().getAgent(AGENT_KEYS.docResearchArchitect);

      const regenResult = await generateWithRetry(
        "regenerateGuided",
        curriculumId,
        AGENT_KEYS.docResearchArchitect,
        () =>
          architect.generate(regenPrompt, {
            structuredOutput: { schema: docResearchPlanSchema },
            requestContext: new RequestContext([["curriculumId", curriculumId]]),
          }),
      );

      return regenResult.object ?? null;
    };

    const deps: StructureEditorToolsDeps = {
      state,
      curriculumId,
      subjectId: curriculum.subjectId,
      curriculumName: curriculum.name,
      regenerateGuided,
    };

    // Carries this turn's mutable draft state + dependencies into the
    // structure-editor agent's dynamically-resolved `tools` config (see
    // that agent's own comment for why `clientTools` is the wrong
    // mechanism here) — scoped to just this one `generate()` call.
    const requestContext = new RequestContext([
      ["structureEditorDeps", deps],
      ["curriculumId", curriculumId],
      ["subjectId", curriculum.subjectId],
    ]);

    const prompt = buildStructureToolTurnPrompt(
      ctx,
      sourceText,
      trustedSources,
      turns.map((t) => ({ role: t.role, message: t.message })),
      priorSnapshot,
      studyTimeSummary(priorSnapshot),
      { researchGapLabels, supplementalSources, existingTags },
    );

    const editorAgent = getMastra().getAgent(AGENT_KEYS.structureEditor);

    const result = await generateWithRetry(
      "submitStructureTurn",
      curriculumId,
      AGENT_KEYS.structureEditor,
      () =>
        editorAgent.generate(prompt, {
          requestContext,
          maxSteps: MAX_TOOL_STEPS,
          onStepFinish: (step: {
            toolCalls?: { payload?: { toolName?: string; args?: unknown } }[];
          }) => {
            for (const call of step.toolCalls ?? []) {
              log.info(
                { curriculumId, tool: call.payload?.toolName, args: call.payload?.args },
                "structure_editor_step",
              );
            }
          },
        }),
    );

    const message = result.text?.trim() || "Updated the draft based on your message.";

    await updateStructureTurn(pendingTurnId, {
      message,
      structureSnapshot: state.snapshot,
      splitSuggestion: state.splitSuggestion,
      toolActions: state.toolActions,
      status: "complete",
    });

    log.info(
      { curriculumId, toolActions: state.toolActions, hasSplitSuggestion: Boolean(state.splitSuggestion) },
      "structure_turn_tool_call_completed",
    );

    return { ok: true };
  } catch (err) {
    log.error({ err, curriculumId }, "structure_turn_regeneration_failed");

    await updateStructureTurn(pendingTurnId, {
      message: "I couldn't update the structure just now — try sending that again.",
      structureSnapshot: priorSnapshotForFallback,
      status: "failed",
    });

    return { ok: true };
  }
}

export type ConfirmStructureResult =
  | Curriculum
  | "not_found"
  | "not_shaping_structure"
  | "no_snapshot";

/**
 * Writes the latest drafted snapshot as real modules/topics rows and flips
 * status to "ready" — the same terminal state every other entry point
 * already reaches, so the pre-assessment redirect and everything
 * downstream needs zero changes.
 */
export async function confirmStructure(curriculumId: string): Promise<ConfirmStructureResult> {
  const curriculum = await getCurriculum(curriculumId);

  if (!curriculum) {
    return "not_found";
  }

  if (curriculum.status !== "shaping_structure") {
    return "not_shaping_structure";
  }

  const snapshot = await getLatestStructureSnapshot(curriculumId);

  if (!snapshot) {
    return "no_snapshot";
  }

  // Offset past merged-in modules a provenance-aware clear left in place
  // (same reasoning as parseCurriculum's own save) — 0 only stayed correct
  // while every clear emptied the curriculum outright.
  await saveCurriculumPlan(curriculumId, snapshot, await maxModuleOrder(curriculumId), {
    defaultIncluded: false,
  });
  await setCurriculumStrictOrder(curriculumId, snapshot.strictOrder ?? false);
  await setCurriculumStatus(curriculumId, "ready");

  const updated = await getCurriculum(curriculumId);

  return updated ?? "not_found";
}
