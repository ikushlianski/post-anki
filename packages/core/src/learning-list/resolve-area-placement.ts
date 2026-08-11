import type { TaxonomyArea } from "@post-anki/shared";

const OTHER_AREA_NORMALIZED_NAME = "other";

export function resolveAreaPlacement(
  proposedAreaName: string | null,
  realAreas: TaxonomyArea[],
): string | null {
  const proposed = normalizeAreaName(proposedAreaName ?? "");

  if (proposed.length > 0) {
    const exactMatch = realAreas.find((area) => normalizeAreaName(area.name) === proposed);

    if (exactMatch) {
      return exactMatch.id;
    }
  }

  const otherArea = realAreas.find(
    (area) => normalizeAreaName(area.name) === OTHER_AREA_NORMALIZED_NAME,
  );

  return otherArea ? otherArea.id : null;
}

function normalizeAreaName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}
