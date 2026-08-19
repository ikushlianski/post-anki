import type { HomeSummary } from "@post-anki/shared";
import {
  countQuestionsAnswered,
  countTopicsMastered,
  listTopSubjectsByActivity,
} from "./home.repo.js";
import { getStreak } from "../streak/streak.service.js";

export async function getHomeSummary(): Promise<HomeSummary> {
  const [topSubjects, topicsMastered, questionsAnswered, streak] = await Promise.all([
    listTopSubjectsByActivity(),
    countTopicsMastered(),
    countQuestionsAnswered(),
    getStreak(),
  ]);

  return {
    topSubjects,
    funStats: {
      currentStreak: streak.currentStreak,
      longestStreak: streak.longestStreak,
      topicsMastered,
      questionsAnswered,
    },
  };
}
