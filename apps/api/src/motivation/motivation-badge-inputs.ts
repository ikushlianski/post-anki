import { masteryPercent, type BadgeInput } from "@post-anki/core";
import { countGoalDays } from "./motivation-goal-days.repo.js";
import { readSubjectCardTotals } from "./motivation-mastery.repo.js";

export async function readOutcomeBadgeInputs(): Promise<Pick<BadgeInput, "goalDays" | "subjectSolid">> {
  const [goalDays, totals] = await Promise.all([countGoalDays(), readSubjectCardTotals()]);

  return {
    goalDays,
    subjectSolid: totals.map((subject) => ({
      subjectId: subject.subjectId,
      subjectName: subject.subjectName,
      totalCards: subject.totalCards,
      percent: masteryPercent(subject.masteredCards, subject.totalCards),
    })),
  };
}
