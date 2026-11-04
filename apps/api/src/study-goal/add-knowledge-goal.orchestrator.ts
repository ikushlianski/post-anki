import { collectSubjectSubtreeIds } from "@post-anki/core";
import {
  currentPeriodKey,
  periodLocalRange,
  type AddKnowledgeGoal,
  AddKnowledgeGoalProgress,
  PutAddKnowledgeGoalInput,
} from "@post-anki/shared";
import { getDb } from "../db/client.js";
import { subjects } from "../db/schema.js";
import { getLocalDayWindow } from "../knowledge-bit/knowledge-bit-review.repo.js";
import {
  deleteAddKnowledgeGoal,
  listAddKnowledgeGoals,
  upsertAddKnowledgeGoal,
} from "./add-knowledge-goal.repo.js";
import { countSourcesBySubject, getRangeWindow, type TimeWindow } from "./study-goal-activity.repo.js";
import { subjectExists } from "./subject-priority.repo.js";

async function windowFor(period: AddKnowledgeGoal["period"], tz: string, now: Date): Promise<TimeWindow> {
  if (period === "day") {
    return getLocalDayWindow(tz, now);
  }

  return getRangeWindow(tz, periodLocalRange("week", currentPeriodKey("week", now, tz)));
}

export async function listGoals(): Promise<AddKnowledgeGoal[]> {
  return listAddKnowledgeGoals();
}

export async function putGoal(input: PutAddKnowledgeGoalInput): Promise<AddKnowledgeGoal | null> {
  if (!(await subjectExists(input.subjectId))) {
    return null;
  }

  return upsertAddKnowledgeGoal(input);
}

export async function removeGoal(id: string): Promise<boolean> {
  return deleteAddKnowledgeGoal(id);
}

export async function listGoalProgress(tz: string, now: Date): Promise<AddKnowledgeGoalProgress[]> {
  const [goals, subjectRows] = await Promise.all([
    listAddKnowledgeGoals(),
    getDb().select({ id: subjects.id, name: subjects.name, parentId: subjects.parentId }).from(subjects),
  ]);
  const known = new Set(subjectRows.map((subject) => subject.id));
  const windows = new Map<string, TimeWindow>();
  const notes = new Map<string, Map<string, number>>();
  const result: AddKnowledgeGoalProgress[] = [];

  for (const goal of goals.filter((candidate) => known.has(candidate.subjectId))) {
    let window = windows.get(goal.period);

    if (!window) {
      window = await windowFor(goal.period, tz, now);
      windows.set(goal.period, window);
      notes.set(goal.period, await countSourcesBySubject(window));
    }

    const direct = notes.get(goal.period)!;
    const added = collectSubjectSubtreeIds(goal.subjectId, subjectRows).reduce(
      (sum, id) => sum + (direct.get(id) ?? 0),
      0,
    );

    result.push({
      subjectId: goal.subjectId,
      period: goal.period,
      target: goal.targetNotes,
      added,
      periodEndsAt: window.endsAt.toISOString(),
    });
  }

  return result;
}
