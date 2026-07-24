export interface TopicTouchState {
  title: string;
  progressStatus: string;
  progressAttempts: number;
  learningStatus: string;
  selfGrade: number | null;
  included: boolean;
}

export interface ModuleTouchState {
  moduleId: string;
  title: string;
  learningStatus: string;
  topics: TopicTouchState[];
}

export interface MergePartition {
  lockedModules: ModuleTouchState[];
  freeModuleIds: string[];
}

export function isSourceMandateUnmet(
  requireSources: boolean,
  incomingSourceCount: number,
): boolean {
  return requireSources && incomingSourceCount === 0;
}

export function isTopicTouched(topic: TopicTouchState): boolean {
  return (
    topic.progressStatus !== "not_started" ||
    topic.progressAttempts > 0 ||
    topic.learningStatus !== "not_started" ||
    topic.selfGrade !== null ||
    topic.included === false
  );
}

export function isModuleTouched(module: ModuleTouchState): boolean {
  if (module.learningStatus !== "not_started") {
    return true;
  }

  return module.topics.some(isTopicTouched);
}

export function partitionModulesForMerge(
  modules: ModuleTouchState[],
): MergePartition {
  const lockedModules: ModuleTouchState[] = [];
  const freeModuleIds: string[] = [];

  for (const module of modules) {
    if (isModuleTouched(module)) {
      lockedModules.push(module);
    } else {
      freeModuleIds.push(module.moduleId);
    }
  }

  return { lockedModules, freeModuleIds };
}

export function filterOutLockedModules<T extends { title: string }>(
  planModules: T[],
  lockedTitles: string[],
): T[] {
  const locked = new Set(lockedTitles.map((t) => t.trim().toLowerCase()));

  return planModules.filter((m) => !locked.has(m.title.trim().toLowerCase()));
}

export interface StudyableTopic {
  included: boolean;
}

export interface StudyableModule {
  topics: StudyableTopic[];
}

export function hasStudyableContent(modules: StudyableModule[]): boolean {
  return modules.some(
    (m) => m.topics.length === 0 || m.topics.some((t) => t.included),
  );
}

export function isResearchAndSourcesConflict(
  researchTriggered: boolean,
  incomingSourceCount: number,
): boolean {
  return researchTriggered && incomingSourceCount > 0;
}

export type CurriculumOrigin = "sources" | "research";

const RESEARCH_ORIGIN_KINDS = new Set(["web_research", "llms_txt"]);

export function resolveCurriculumOrigin(sourceKinds: string[]): CurriculumOrigin {
  return sourceKinds.some((kind) => RESEARCH_ORIGIN_KINDS.has(kind))
    ? "research"
    : "sources";
}

const MIN_LLMS_TXT_LENGTH = 30;
const HTML_DOCUMENT_MARKERS = ["<!doctype html", "<html"];

export function looksLikeLlmsTxtContent(body: string): boolean {
  const trimmed = body.trim();

  if (trimmed.length < MIN_LLMS_TXT_LENGTH) {
    return false;
  }

  const openingBytes = trimmed.slice(0, 200).toLowerCase();

  return !HTML_DOCUMENT_MARKERS.some((marker) => openingBytes.includes(marker));
}

export function shouldIncludeTopicByDefault(
  moduleLevel: string | null | undefined,
  preferredLevel: string | null | undefined,
): boolean {
  if (!moduleLevel || !preferredLevel) {
    return false;
  }

  return moduleLevel === preferredLevel;
}

export function isDocUrlAndResearchTopicConflict(
  docUrl: string | null | undefined,
  researchTopic: string | null | undefined,
): boolean {
  return (
    Boolean(docUrl && docUrl.trim().length > 0) &&
    Boolean(researchTopic && researchTopic.trim().length > 0)
  );
}

export interface PriorResearchSource {
  kind: string;
  value: string;
}

export type RetryResearchSource =
  | { mode: "url"; docUrl: string; name: string }
  | { mode: "name"; name: string };

function looksLikeAbsoluteUrl(value: string): boolean {
  try {
    const parsed = new URL(value);

    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function resolveRetryResearchSource(
  priorSources: PriorResearchSource[],
  curriculumName: string,
): RetryResearchSource {
  const candidate = priorSources.find((row) => looksLikeAbsoluteUrl(row.value));

  if (candidate) {
    return { mode: "url", docUrl: candidate.value, name: curriculumName };
  }

  return { mode: "name", name: curriculumName };
}
