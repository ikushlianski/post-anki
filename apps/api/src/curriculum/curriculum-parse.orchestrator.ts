import type { SourceDraft } from "@post-anki/shared";
import { getMastra, AGENT_KEYS } from "../mastra/mastra.js";
import { log } from "../shared/log.js";
import { curriculumPlanSchema, curriculumMergePlanSchema } from "./curriculum-plan.js";
import { gatherSourceCandidates } from "./source-candidates.js";
import { buildParsePrompt, buildMergePrompt } from "./curriculum-prompt.js";
import {
  partitionModulesForMerge,
  filterOutLockedModules,
  resolveRetryResearchSource,
} from "./curriculum-rules.js";
import { resolveSourceText } from "./source-fetch.js";
import { assembleAllSourceText } from "./source-text.js";
import { generateDraftStructure } from "./curriculum-structure.js";
import {
  addCurriculumSources,
  approveAllPendingSources,
  clearCurriculumStructure,
  countModules,
  deleteAllCurriculumSources,
  deleteModules,
  getCurriculum,
  getCurriculumPromptContext,
  getCurriculumSourceRows,
  getModuleProgressSnapshots,
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

export async function parseCurriculum(curriculumId: string): Promise<void> {
  try {
    const ctx = await getCurriculumPromptContext(curriculumId);

    if (!ctx) {
      throw new Error("curriculum not found for parse");
    }

    const rows = await getCurriculumSourceRows(curriculumId);
    const sourceText = await resolveAndStore(rows);
    const agent = getMastra().getAgent(AGENT_KEYS.curriculumArchitect);
    const prompt = buildParsePrompt(ctx, sourceText);

    const result = await agent.generate(prompt, {
      structuredOutput: { schema: curriculumPlanSchema },
    });

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
  } catch (err) {
    log.error({ err, curriculumId }, "curriculum_parse_failed");
    await setCurriculumStatus(curriculumId, "failed");
  }
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
export async function researchCurriculum(
  curriculumId: string,
  input: ResearchCurriculumInput,
): Promise<void> {
  try {
    // Recorded before candidate gathering: an origin-tracking marker, not a
    // reviewable candidate — always approved immediately, so
    // `resolveCurriculumOrigin` and "Retry research" keep working even for
    // a curriculum whose real candidates end up all deleted or none found
    // (see architecture.md's origin-tracking note). It carries no grounding
    // text of its own; real grounding now lives on the individual
    // candidate rows below.
    await insertResearchSource(
      curriculumId,
      {
        kind: "web_research",
        value: input.docUrl ?? input.name,
        title: `Auto-researched: ${input.name}`,
      },
      "",
    );

    const candidates = await gatherSourceCandidates(input);

    await insertPendingSources(
      curriculumId,
      candidates.map((c) => ({
        kind: c.kind,
        url: c.url,
        title: c.title,
        fetchedText: c.fetchedText,
      })),
    );

    await setCurriculumStatus(curriculumId, "awaiting_source_approval");

    log.info(
      { curriculumId, candidates: candidates.length },
      "source_candidates_gathered",
    );
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

export async function retryResearch(curriculumId: string): Promise<void> {
  try {
    const curriculum = await getCurriculum(curriculumId);

    if (!curriculum) {
      throw new Error("curriculum not found for retry research");
    }

    const priorSourceRows = await getCurriculumSourceRows(curriculumId);
    const resolved = resolveRetryResearchSource(
      priorSourceRows
        .filter((row) => row.kind === "web_research" || row.kind === "llms_txt")
        .map((row) => ({ kind: row.kind, value: row.value })),
      curriculum.name,
    );

    await clearCurriculumStructure(curriculumId);
    await deleteAllCurriculumSources(curriculumId);

    if (resolved.mode === "url") {
      await researchCurriculum(curriculumId, { name: resolved.name, docUrl: resolved.docUrl });
    } else {
      await researchCurriculum(curriculumId, { name: resolved.name });
    }
  } catch (err) {
    log.error({ err, curriculumId }, "curriculum_retry_research_failed");
    await setCurriculumStatus(curriculumId, "failed");
  }
}

export async function mergeSourcesIntoCurriculum(
  curriculumId: string,
  newDrafts: SourceDraft[],
): Promise<void> {
  try {
    await addCurriculumSources(curriculumId, newDrafts);
    await setCurriculumStatus(curriculumId, "curating");

    const snapshots = await getModuleProgressSnapshots(curriculumId);
    const { lockedModules, freeModuleIds } = partitionModulesForMerge(snapshots);

    const sourceText = await assembleAllSourceText(curriculumId);
    const ctx = await getCurriculumPromptContext(curriculumId);

    if (!ctx) {
      throw new Error("curriculum not found for merge");
    }

    const agent = getMastra().getAgent(AGENT_KEYS.curriculumArchitect);
    const prompt = buildMergePrompt(
      ctx,
      lockedModules.map((m) => ({
        title: m.title,
        topics: m.topics.map((t) => t.title),
      })),
      sourceText,
    );

    const result = await agent.generate(prompt, {
      structuredOutput: { schema: curriculumMergePlanSchema },
    });

    const fresh = result.object
      ? filterOutLockedModules(
          result.object.modules,
          lockedModules.map((m) => m.title),
        )
      : [];

    if (fresh.length > 0) {
      await deleteModules(freeModuleIds);

      const offset = await countModules(curriculumId);

      await saveCurriculumPlan(curriculumId, { modules: fresh }, offset);
    }

    await setCurriculumStatus(curriculumId, "ready");

    log.info(
      {
        curriculumId,
        locked: lockedModules.length,
        rebuilt: freeModuleIds.length,
        produced: fresh.length,
      },
      "curriculum_sources_merged",
    );
  } catch (err) {
    log.error({ err, curriculumId }, "curriculum_merge_failed");
    await setCurriculumStatus(curriculumId, "failed");
  }
}
