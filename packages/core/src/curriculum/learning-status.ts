import type { LearningStatus, Module, Topic } from "@post-anki/shared";

export function rollUpLearningStatus(children: LearningStatus[]): LearningStatus {
  const active = children.filter((s) => s !== "skipping");

  if (active.length === 0) {
    return children.length === 0 ? "not_started" : "skipping";
  }

  if (active.some((s) => s === "probing")) {
    return "probing";
  }

  if (active.some((s) => s === "going_deeper")) {
    return "going_deeper";
  }

  if (active.some((s) => s === "reviewing")) {
    return "reviewing";
  }

  if (active.every((s) => s === "done")) {
    return "done";
  }

  if (active.every((s) => s === "not_started")) {
    return "not_started";
  }

  return "probing";
}

export function moduleLearningStatus(topics: Topic[]): LearningStatus {
  return rollUpLearningStatus(
    topics.filter((t) => t.included).map((t) => t.learningStatus),
  );
}

export function curriculumLearningStatus(modules: Module[]): LearningStatus {
  return rollUpLearningStatus(modules.map((m) => m.learningStatus));
}
