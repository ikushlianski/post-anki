import type {
  SubjectCheckConfidence,
  SubjectCheckNewSubject,
  SubjectCheckRecommendation,
  SubjectCheckResponse,
} from "@post-anki/shared";
import type { SubjectHierarchyRow } from "@post-anki/core";
import type { SubjectCheckAliases, SubjectCheckModelOutput } from "../mastra/knowledge-source-subject-checker.agent.js";
import { sanitizeProposedName, sanitizeReason } from "../subject-suggestion/subject-suggestion-text.js";
import type { SubjectCheckParent } from "./knowledge-source-subject-check.candidates.js";

const CONFIDENCE_RANK: Record<SubjectCheckConfidence, number> = { high: 0, medium: 1, low: 2 };
const MAX_RECOMMENDATIONS = 3;
const BUSINESS_NAME = "business";

export interface ValidateAdviceContext {
  aliases: SubjectCheckAliases;
  hierarchy: SubjectHierarchyRow[];
  parents: SubjectCheckParent[];
}

function cleanName(raw: string): string | null {
  return sanitizeProposedName(raw.replace(/[<>]/g, "").replace(/\s+/g, " "));
}

function validateRecommendations(
  output: SubjectCheckModelOutput,
  aliases: SubjectCheckAliases,
): SubjectCheckRecommendation[] {
  const seen = new Set<string>();
  const recommendations: SubjectCheckRecommendation[] = [];

  const strongestFirst = [...output.recommendations].sort(
    (a, b) => CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence],
  );

  for (const entry of strongestFirst) {
    const candidate = aliases.candidates.get(entry.alias);

    if (!candidate || seen.has(candidate.id)) {
      continue;
    }

    seen.add(candidate.id);
    recommendations.push({
      subjectId: candidate.id,
      subjectLabel: candidate.label,
      confidence: entry.confidence,
      reason: sanitizeReason(entry.reason),
    });
  }

  return recommendations.slice(0, MAX_RECOMMENDATIONS);
}

export function placeNewSubject(
  proposal: NonNullable<SubjectCheckModelOutput["newSubject"]>,
  context: ValidateAdviceContext,
): Pick<SubjectCheckNewSubject, "parentSubjectId" | "parentLabel" | "kind"> | null {
  const kind = proposal.kindHint === "other" ? "general" : proposal.kindHint;

  if (proposal.kindHint === "business") {
    const root = context.hierarchy.find((row) => row.parentId === null && row.name.trim().toLowerCase() === BUSINESS_NAME);
    const rootParent = root ? context.parents.find((parent) => parent.id === root.id) : undefined;

    if (root && !rootParent) {
      return null;
    }

    return { kind, parentSubjectId: rootParent?.id ?? null, parentLabel: rootParent?.label ?? null };
  }

  if (proposal.parentAlias === null) {
    return { kind, parentSubjectId: null, parentLabel: null };
  }

  const parent = context.aliases.parents.get(proposal.parentAlias);

  return parent ? { kind, parentSubjectId: parent.id, parentLabel: parent.label } : null;
}

function validateNewSubject(
  output: SubjectCheckModelOutput,
  context: ValidateAdviceContext,
): SubjectCheckNewSubject | null {
  if (!output.newSubject) {
    return null;
  }

  const name = cleanName(output.newSubject.name);
  const placement = placeNewSubject(output.newSubject, context);

  if (!name || !placement) {
    return null;
  }

  const clash = context.hierarchy.some(
    (row) => row.parentId === placement.parentSubjectId && row.name.trim().toLowerCase() === name.toLowerCase(),
  );

  return clash ? null : { name, ...placement, reason: sanitizeReason(output.newSubject.reason) };
}

export function validateAdvice(output: SubjectCheckModelOutput, context: ValidateAdviceContext): SubjectCheckResponse {
  const recommendations = validateRecommendations(output, context.aliases);
  const hasHigh = recommendations.some((entry) => entry.confidence === "high");
  const newSubject = hasHigh ? null : validateNewSubject(output, context);

  if (recommendations.length === 0 && newSubject === null) {
    return { status: "none" };
  }

  return { status: "ok", recommendations, newSubject };
}
