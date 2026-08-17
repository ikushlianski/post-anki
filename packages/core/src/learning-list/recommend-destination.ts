import type {
  AreaMatch,
  ExistingCurriculumMatch,
  LearningListDestination,
  SeriesVerdictValue,
} from "@post-anki/shared";

export function recommendDestination(
  verdict: SeriesVerdictValue,
  _areaMatch: AreaMatch | null,
  existingCurriculumMatch: ExistingCurriculumMatch | null,
): LearningListDestination {
  switch (verdict) {
    case "single":
      return "fold_in";
    case "series":
      return existingCurriculumMatch !== null ? "extend_curriculum" : "mini_course";
    case "unknown":
      return "park";
  }
}
