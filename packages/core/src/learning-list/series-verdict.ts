import type { SeriesPartNumber, SeriesSignals, SeriesVerdict } from "@post-anki/shared";

const SIBLING_NAV_AMBIGUITY_THRESHOLD = 3;

const DEEP_BREADCRUMB_DEPTH = 3;

const NO_SERIES_EVIDENCE_REASON =
  "no series wording, sibling article links or pagination were found";

const WEAK_EVIDENCE_REASON =
  "nothing on the page states it belongs to a series, and the hints found are too weak to suggest one";

const UNCONFIRMED_REASON =
  "nothing on the page states it belongs to a series, so this could not be confirmed";

export function deriveSeriesVerdict(signals: SeriesSignals): SeriesVerdict {
  const phrase = (signals.explicitSeriesPhrase ?? "").trim();
  const siblingLinks = toCount(signals.siblingNavLinkCount);
  const breadcrumbDepth = toCount(signals.breadcrumbDepth);
  const hasPagination = signals.hasPaginationLinks === true;
  const declaredPart = declaredSeriesPart(signals.detectedPart);

  const statedReasons: string[] = [];

  if (phrase.length > 0) {
    statedReasons.push(`the page states it is part of a series: "${phrase}"`);
  }

  if (declaredPart !== null) {
    statedReasons.push(partReason(declaredPart));
  }

  const structuralReasons: string[] = [];

  if (siblingLinks > 0) {
    structuralReasons.push(
      `${siblingLinks} sibling article ${pluralize(siblingLinks, "link", "links")} ${pluralize(siblingLinks, "was", "were")} found in the page navigation`,
    );
  }

  if (hasPagination) {
    structuralReasons.push("the page has next/previous pagination links");
  }

  if (breadcrumbDepth >= DEEP_BREADCRUMB_DEPTH) {
    structuralReasons.push(`the page sits ${breadcrumbDepth} levels deep in its breadcrumb trail`);
  }

  if (statedReasons.length > 0) {
    return { verdict: "series", reasons: [...statedReasons, ...structuralReasons] };
  }

  const isAmbiguous =
    siblingLinks >= SIBLING_NAV_AMBIGUITY_THRESHOLD ||
    hasPagination ||
    (breadcrumbDepth >= DEEP_BREADCRUMB_DEPTH && siblingLinks > 0);

  if (isAmbiguous) {
    return { verdict: "unknown", reasons: [...structuralReasons, UNCONFIRMED_REASON] };
  }

  return {
    verdict: "single",
    reasons:
      structuralReasons.length > 0
        ? [...structuralReasons, WEAK_EVIDENCE_REASON]
        : [NO_SERIES_EVIDENCE_REASON],
  };
}

function declaredSeriesPart(part: SeriesPartNumber | null): SeriesPartNumber | null {
  if (part === null) {
    return null;
  }

  const partNumber = toCount(part.part);
  const total = part.total === null ? null : toCount(part.total);

  if (partNumber < 1) {
    return null;
  }

  if (total !== null && total < 2) {
    return null;
  }

  return { part: partNumber, total };
}

function partReason(part: SeriesPartNumber): string {
  return part.total === null
    ? `the page is labelled part ${part.part}`
    : `the page is labelled part ${part.part} of ${part.total}`;
}

function toCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}
