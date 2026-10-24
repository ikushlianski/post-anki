export const RESEARCH_MARKER_TITLE_PREFIX = "Auto-researched: ";

export interface ResearchMarkerInput {
  name: string;
  docUrl?: string | null;
}

export function researchMarkerFor(input: ResearchMarkerInput): {
  kind: "web_research";
  value: string;
  title: string;
} {
  return {
    kind: "web_research",
    value: input.docUrl ?? input.name,
    title: `${RESEARCH_MARKER_TITLE_PREFIX}${input.name}`,
  };
}

export function researchInputFromMarker(marker: { value: string; title: string | null }): ResearchMarkerInput {
  const name = marker.title?.startsWith(RESEARCH_MARKER_TITLE_PREFIX)
    ? marker.title.slice(RESEARCH_MARKER_TITLE_PREFIX.length)
    : marker.value;

  return marker.value === name ? { name } : { name, docUrl: marker.value };
}
