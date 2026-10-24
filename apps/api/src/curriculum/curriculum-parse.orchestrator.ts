import { RequestContext } from "@mastra/core/request-context";
import { getMastra, AGENT_KEYS } from "../mastra/mastra.js";
import { generateWithRetry } from "../mastra/generate-with-retry.js";
import { log } from "../shared/log.js";
import { curriculumPlanSchema } from "./curriculum-plan.js";
import { gatherSourceCandidates } from "./source-candidates.js";
import { buildParsePrompt } from "./curriculum-prompt.js";
import {
  resolveRetryResearchSource,
} from "./curriculum-rules.js";
import { researchMarkerFor } from "./curriculum-research-marker.js";
import { resolveSourceText } from "./source-fetch.js";
import { listTags } from "../tag/tag.repo.js";
import { assembleAllSourceText } from "./source-text.js";
import { generateDraftStructure } from "./curriculum-structure.js";
import {
  approveAllPendingSources,
  clearCurriculumStructure,
  deleteAllCurriculumSources,
  getCurriculum,
  getCurriculumPromptContext,
  getCurriculumSourceRows,
  insertPendingSources,
  insertResearchSource,
  maxModuleOrder,
  saveCurriculumPlan,
  setCurriculumStatus,
  storeFetchedText,
  type SourceRow,
} from "./curriculum.repo.js";

export { assembleAllSourceText };

async function resolveAndStore(rows: SourceRow[]): Promise<string> {
  const parts = await Promise.all(
    rows.map(async (row) => {
      const text = await resolveSourceText(row.kind, row.value);

      await storeFetchedText(row.id, text);

      return row.title ? `# ${row.title}\n${text}` : text;
    }),
  );

  return parts.filter((p) => p.trim().length > 0).join("\n\n---\n\n");
}

export async function parseCurriculumOrThrow(curriculumId: string): Promise<number> {
  const ctx = await getCurriculumPromptContext(curriculumId);

  if (!ctx) {
    throw new Error("curriculum not found for parse");
  }

  const rows = await getCurriculumSourceRows(curriculumId);
  const [sourceText, existingTags] = await Promise.all([
    resolveAndStore(rows),
    listTags().then((tags) => tags.map((t) => t.name)),
  ]);
  const agent = getMastra().getAgent(AGENT_KEYS.curriculumArchitect);
  const prompt = buildParsePrompt(ctx, sourceText, existingTags);

  const result = await generateWithRetry(
    "curriculum_parse",
    curriculumId,
    AGENT_KEYS.curriculumArchitect,
    () =>
      agent.generate(prompt, {
        structuredOutput: { schema: curriculumPlanSchema },
        requestContext: new RequestContext([["curriculumId", curriculumId]]),
      }),
  );

  if (!result.object) {
    throw new Error("architect returned no structured plan");
  }

  // Offset past whatever survived the clear rather than restarting at 1:
  // `clearCurriculumStructure` now spares merged-in modules, which keep
  // the order values `mergeCurricula` offset them to, so a fresh plan
  // starting at 1 would interleave with them under `sortForDisplay`.
  await saveCurriculumPlan(curriculumId, result.object, await maxModuleOrder(curriculumId));
  await setCurriculumStatus(curriculumId, "ready");

  log.info(
    { curriculumId, modules: result.object.modules.length },
    "curriculum_parsed",
  );

  return result.object.modules.length;
}

export async function parseCurriculum(curriculumId: string): Promise<void> {
  try {
    await parseCurriculumOrThrow(curriculumId);
  } catch (err) {
    log.error({ err, curriculumId }, "curriculum_parse_failed");
    await setCurriculumStatus(curriculumId, "failed");
  }
}

export async function reparseCurriculumOrThrow(curriculumId: string): Promise<number> {
  await clearCurriculumStructure(curriculumId);

  return parseCurriculumOrThrow(curriculumId);
}

export async function reparseCurriculum(curriculumId: string): Promise<void> {
  try {
    await clearCurriculumStructure(curriculumId);
    await parseCurriculum(curriculumId);
  } catch (err) {
    log.error({ err, curriculumId }, "curriculum_reparse_failed");
    await setCurriculumStatus(curriculumId, "failed");
  }
}

export interface ResearchCurriculumInput {
  name: string;
  docUrl?: string | null;
}

/**
 * Candidate gathering only — the first half of what used to be a single
 * research-to-synthesis call. Resolves an entry point (the given docUrl, or
 * a bare name's likely official docs URL), runs the docs-site chain and the
 * general trusted-source search, and lands the curriculum at
 * "awaiting_source_approval" with every candidate stored as a pending
 * source row. No architect-agent call happens here — that only happens
 * once the learner approves (see `generateCurriculumFromApprovedSources`).
 */
export async function researchCurriculumOrThrow(
  curriculumId: string,
  input: ResearchCurriculumInput,
): Promise<void> {
  // Recorded before candidate gathering: an origin-tracking marker, not a
  // reviewable candidate — always approved immediately, so
  // `resolveCurriculumOrigin` and "Retry research" keep working even for
  // a curriculum whose real candidates end up all deleted or none found
  // (see architecture.md's origin-tracking note). It carries no grounding
  // text of its own; real grounding now lives on the individual
  // candidate rows below.
  await insertResearchSource(curriculumId, researchMarkerFor(input), "");

  const candidates = await gatherSourceCandidates(input, { curriculumId });

  await insertPendingSources(
    curriculumId,
    candidates.map((c) => ({
      kind: c.kind,
      url: c.url,
      title: c.title,
      fetchedText: c.fetchedText,
      discoveryTier: c.discoveryTier,
    })),
  );

  await setCurriculumStatus(curriculumId, "awaiting_source_approval");

  log.info({ curriculumId, candidates: candidates.length }, "source_candidates_gathered");
}

export async function researchCurriculum(
  curriculumId: string,
  input: ResearchCurriculumInput,
): Promise<void> {
  try {
    await researchCurriculumOrThrow(curriculumId, input);
  } catch (err) {
    log.error({ err, curriculumId }, "source_candidate_gathering_failed");
    await setCurriculumStatus(curriculumId, "failed");
  }
}

/**
 * The second half of the gate: called only once the learner has approved
 * (or explicitly overridden with zero sources). Flips any still-pending
 * rows to approved, then — instead of a single one-shot synthesis straight
 * to "ready" — hands off to `generateDraftStructure` (Phase 5), which
 * produces a first draft and lands the curriculum on "shaping_structure"
 * for conversational review instead. Reaching "ready" now always means a
 * human confirmed the structure in that chat, for every entry point alike.
 */
export async function generateCurriculumFromApprovedSources(
  curriculumId: string,
): Promise<void> {
  await approveAllPendingSources(curriculumId);
  await generateDraftStructure(curriculumId);
}

export async function resolveRetryResearchInput(
  curriculumId: string,
): Promise<ResearchCurriculumInput> {
  const curriculum = await getCurriculum(curriculumId);

  if (!curriculum) {
    throw new Error("curriculum not found for retry research");
  }

  const priorSourceRows = await getCurriculumSourceRows(curriculumId);
  const resolved = resolveRetryResearchSource(
    priorSourceRows
      .filter((row) => row.kind === "web_research" || row.kind === "llms_txt")
      .map((row) => ({
        kind: row.kind,
        value: row.value,
        mergedFromCurriculumId: row.mergedFromCurriculumId,
      })),
    curriculum.name,
  );

  return resolved.mode === "url"
    ? { name: resolved.name, docUrl: resolved.docUrl }
    : { name: resolved.name };
}

export async function retryResearchOrThrow(curriculumId: string): Promise<void> {
  const input = await resolveRetryResearchInput(curriculumId);

  await clearCurriculumStructure(curriculumId);
  await deleteAllCurriculumSources(curriculumId);
  await researchCurriculumOrThrow(curriculumId, input);
}

export async function retryResearch(curriculumId: string): Promise<void> {
  try {
    await retryResearchOrThrow(curriculumId);
  } catch (err) {
    log.error({ err, curriculumId }, "curriculum_retry_research_failed");
    await setCurriculumStatus(curriculumId, "failed");
  }
}

export { mergeSourcesIntoCurriculum } from "./curriculum-merge.orchestrator.js";
