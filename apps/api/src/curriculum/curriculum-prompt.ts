export interface PromptContext {
  curriculumName: string;
  curriculumDescription: string | null;
  subjectName: string;
  subjectDescription: string | null;
}

function nonEmpty(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function contextHeader(ctx: PromptContext): string[] {
  const lines: string[] = [];

  if (ctx.subjectName.trim().length > 0) {
    lines.push(`Subject: ${ctx.subjectName.trim()}`);
  }

  const subjectDescription = nonEmpty(ctx.subjectDescription);

  if (subjectDescription) {
    lines.push(`Subject context: ${subjectDescription}`);
  }

  lines.push(`Curriculum: ${ctx.curriculumName}`);

  const curriculumDescription = nonEmpty(ctx.curriculumDescription);

  if (curriculumDescription) {
    lines.push(`Curriculum context: ${curriculumDescription}`);
  }

  return lines;
}

export function buildParsePrompt(ctx: PromptContext, sourceText: string): string {
  return [
    ...contextHeader(ctx),
    "",
    "Pasted source material:",
    sourceText.length > 0
      ? sourceText
      : "(no sources pasted — propose a sensible module/topic skeleton for this curriculum, guided by the subject and curriculum context above)",
  ].join("\n");
}

export interface LockedModuleOutline {
  title: string;
  topics: string[];
}

function lockedOutline(lockedModules: LockedModuleOutline[]): string {
  if (lockedModules.length === 0) {
    return "(nothing locked yet — you may shape the whole curriculum)";
  }

  return lockedModules
    .map((m) => {
      const topics = m.topics.map((t) => `    - ${t}`).join("\n");

      return topics.length > 0 ? `- ${m.title}\n${topics}` : `- ${m.title}`;
    })
    .join("\n");
}

export function buildMergePrompt(
  ctx: PromptContext,
  lockedModules: LockedModuleOutline[],
  sourceText: string,
): string {
  return [
    ...contextHeader(ctx),
    "",
    "These modules are already being studied or have been confirmed. KEEP them as-is — do NOT repeat, rename, or restructure them:",
    lockedOutline(lockedModules),
    "",
    "All source material gathered for this curriculum so far:",
    sourceText.length > 0 ? sourceText : "(no source text available)",
    "",
    "Rebuild the REST of the curriculum from this material: revise and extend the not-yet-studied areas, and add any new modules/topics the material now warrants. Produce ONLY modules that are NOT in the locked list above. If the material adds nothing beyond what is locked, return an empty modules array.",
  ].join("\n");
}

export type ResearchGroundingKind = "llms_txt" | "web_research";

export interface BuildResearchPromptOptions {
  groundingKind?: ResearchGroundingKind;
  preferredLevel?: string | null;
}

export function buildResearchPrompt(
  technologyName: string,
  groundingText: string,
  ctx?: PromptContext | null,
  options?: BuildResearchPromptOptions,
): string {
  const header = ctx ? contextHeader(ctx) : [`Technology: ${technologyName}`];
  const groundingIntro =
    options?.groundingKind === "llms_txt"
      ? "This is the site's own published map of its documentation (llms.txt / llms-full.txt) — treat it as the primary, authoritative outline of what this technology covers:"
      : "Web research gathered on this technology (current version numbers, recent API changes, canonical terminology, common pitfalls):";

  const lines = [
    ...header,
    "",
    groundingIntro,
    groundingText.length > 0
      ? groundingText
      : "(the web search returned nothing usable — rely on your own knowledge of this technology)",
    "",
    "Combine this grounding with your own trained knowledge of the technology to propose a full learning map, organized as modules tiered basic/medium/advanced.",
  ];

  if (options?.preferredLevel) {
    lines.push(
      "",
      `The learner most wants to study the "${options.preferredLevel}" tier right now — give that tier fuller treatment (more modules/topics) than the others, without leaving the other tiers empty.`,
    );
  }

  return lines.join("\n");
}

export interface TrustedSourceRef {
  url: string;
  title: string;
}

function trustedSourcesBlock(candidates: TrustedSourceRef[]): string {
  if (candidates.length === 0) {
    return "(the trusted-source web search for this stage returned nothing usable)";
  }

  return candidates.map((c) => `- ${c.title} — ${c.url}`).join("\n");
}

interface SnapshotOutlineTopic {
  title: string;
}

interface SnapshotOutlineModule {
  title: string;
  level: string;
  topics: SnapshotOutlineTopic[];
}

interface SnapshotOutline {
  modules: SnapshotOutlineModule[];
}

function snapshotOutline(snapshot: SnapshotOutline | null): string {
  if (!snapshot || snapshot.modules.length === 0) {
    return "(no draft yet)";
  }

  return snapshot.modules
    .map((m) => {
      const topics = m.topics.map((t) => `    - ${t.title}`).join("\n");
      const header = `- [${m.level}] ${m.title}`;

      return topics.length > 0 ? `${header}\n${topics}` : header;
    })
    .join("\n");
}

export interface StructureTurnRef {
  role: "user" | "assistant";
  message: string;
}

function turnHistoryBlock(turns: StructureTurnRef[]): string {
  if (turns.length === 0) {
    return "(no conversation yet)";
  }

  return turns
    .map((t) => `${t.role === "user" ? "Learner" : "Mentor"}: ${t.message}`)
    .join("\n");
}

/**
 * The first architect-agent call in structure shaping (Phase 5) — used both
 * for the bare-name/docUrl path (once sources are approved) and the pasted-
 * material path (immediately). Always preceded by a trusted-source web
 * search, per the plan's "at every stage of curriculum shaping" requirement.
 */
export function buildStructureDraftPrompt(
  ctx: PromptContext,
  sourceText: string,
  trustedSources: TrustedSourceRef[],
): string {
  return [
    ...contextHeader(ctx),
    "",
    "Approved source material gathered so far:",
    sourceText.length > 0
      ? sourceText
      : "(no approved source material — rely on your own trained knowledge)",
    "",
    "Trusted-source web search run for this stage (official docs, established company engineering blogs, and research papers):",
    trustedSourcesBlock(trustedSources),
    "",
    "Propose a FIRST DRAFT of the full learning map for this curriculum, following the two-step reasoning from your instructions: first the general topics (modules), then the subtopics within each.",
    "",
    "Granularity: each topic must represent one coherent concept a learner would study as a unit — never split finer than that. When source material spans many small pages (e.g. a crawled docs site), group pages that cover the same concept into a single topic instead of creating one topic per page.",
    "",
    "Provenance: the approved source material above marks each crawled page with a line like \"# <title> (SOURCE_URL: <url>)\". When a topic's content comes chiefly from one such page, set that topic's sourceUrl to the EXACT url from that marker. Set sourceUrl to null when the topic draws on pasted text with no such marker, spans several pages, or comes from your own trained knowledge.",
  ].join("\n");
}

/**
 * Every subsequent chat turn, now sent to the TOOL-CALLING structure-editor
 * agent (Phase 5's tool-calling structure editor) rather than requesting a
 * fresh structured-output regeneration directly — Mastra's structured
 * output and tool-calling don't compose on the same call, and the whole
 * point of the tool set is that the agent picks a targeted edit instead of
 * silently rebuilding everything. Includes the current draft verbatim, the
 * full conversation so far, and a live study-time estimate so the agent can
 * judge for itself whether a `suggestSplitIntoCourses` call is warranted.
 */
export function buildStructureToolTurnPrompt(
  ctx: PromptContext,
  sourceText: string,
  trustedSources: TrustedSourceRef[],
  turns: StructureTurnRef[],
  currentSnapshot: SnapshotOutline,
  studyTimeSummary: string,
  options?: { researchGapLabels?: string[]; supplementalSources?: TrustedSourceRef[] },
): string {
  const lines = [
    ...contextHeader(ctx),
    "",
    "Approved source material gathered so far:",
    sourceText.length > 0
      ? sourceText
      : "(no approved source material — rely on your own trained knowledge)",
    "",
    "Trusted-source web search run for this stage (official docs, established company engineering blogs, and research papers):",
    trustedSourcesBlock(trustedSources),
  ];

  const gapLabels = options?.researchGapLabels ?? [];

  if (gapLabels.length > 0) {
    lines.push(
      "",
      `Supplemental trusted-source research requested for these flagged items: ${gapLabels.join(", ")}`,
      trustedSourcesBlock(options?.supplementalSources ?? []),
    );
  }

  lines.push(
    "",
    "The CURRENT draft structure:",
    snapshotOutline(currentSnapshot),
    "",
    `Estimated study time for the current draft: ${studyTimeSummary}`,
    "",
    "Conversation so far:",
    turnHistoryBlock(turns),
    "",
    "Use your tools to make the edit(s) the learner's latest message above asks for, then reply with a short, plain summary of what you did.",
  );

  return lines.join("\n");
}

/**
 * The `regenerateStructure` tool's own internal call — a narrower,
 * single-instruction version of a full regeneration, used as a fallback
 * when none of the structural edit tools fit the learner's request.
 */
export function buildStructureGuidedRegenPrompt(
  ctx: PromptContext,
  sourceText: string,
  trustedSources: TrustedSourceRef[],
  currentSnapshot: SnapshotOutline,
  guidance: string,
): string {
  return [
    ...contextHeader(ctx),
    "",
    "Approved source material gathered so far:",
    sourceText.length > 0
      ? sourceText
      : "(no approved source material — rely on your own trained knowledge)",
    "",
    "Trusted-source web search run for this stage (official docs, established company engineering blogs, and research papers):",
    trustedSourcesBlock(trustedSources),
    "",
    "The CURRENT draft structure — revise it, do not start over from nothing:",
    snapshotOutline(currentSnapshot),
    "",
    `Guidance for this revision: ${guidance}`,
    "",
    "Produce a REVISED full structure that directly addresses the guidance above. Keep what still makes sense as-is; change only what the guidance asks for.",
  ].join("\n");
}
