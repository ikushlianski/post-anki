import { describe, it, expect } from "vitest";
import {
  isSourceMandateUnmet,
  isTopicTouched,
  isModuleTouched,
  partitionModulesForMerge,
  filterOutLockedModules,
  type ModuleTouchState,
  type TopicTouchState,
} from "./curriculum-rules.js";

const PRISTINE_TOPIC: TopicTouchState = {
  title: "A topic",
  progressStatus: "not_started",
  progressAttempts: 0,
  learningStatus: "not_started",
  selfGrade: null,
  included: true,
};

function pristineModule(id: string, title: string): ModuleTouchState {
  return { moduleId: id, title, learningStatus: "not_started", topics: [PRISTINE_TOPIC] };
}

describe("isSourceMandateUnmet", () => {
  describe("when the subject requires sources", () => {
    it("blocks a curriculum created with no sources", () => {
      expect(isSourceMandateUnmet(true, 0)).toBe(true);
    });

    it("allows a curriculum that supplies at least one source", () => {
      expect(isSourceMandateUnmet(true, 1)).toBe(false);
    });
  });

  describe("when the subject does not require sources", () => {
    it("allows a memory-only curriculum", () => {
      expect(isSourceMandateUnmet(false, 0)).toBe(false);
    });
  });
});

describe("isTopicTouched", () => {
  describe("a topic the learner has never engaged with", () => {
    it("is untouched", () => {
      expect(isTopicTouched(PRISTINE_TOPIC)).toBe(false);
    });
  });

  describe("any sign of engagement", () => {
    it("counts an attempt, a grade, an excluded topic, or moved status as touched", () => {
      expect(isTopicTouched({ ...PRISTINE_TOPIC, progressAttempts: 1 })).toBe(true);
      expect(isTopicTouched({ ...PRISTINE_TOPIC, selfGrade: 3 })).toBe(true);
      expect(isTopicTouched({ ...PRISTINE_TOPIC, included: false })).toBe(true);
      expect(isTopicTouched({ ...PRISTINE_TOPIC, progressStatus: "mastered" })).toBe(true);
      expect(isTopicTouched({ ...PRISTINE_TOPIC, learningStatus: "probing" })).toBe(true);
    });
  });
});

describe("isModuleTouched", () => {
  describe("a fresh module with only pristine topics", () => {
    it("is free to reshape", () => {
      expect(isModuleTouched(pristineModule("m1", "Fresh"))).toBe(false);
    });
  });

  describe("a module the learner has started", () => {
    it("is locked when its learning status moved", () => {
      expect(
        isModuleTouched({ ...pristineModule("m1", "Started"), learningStatus: "probing" }),
      ).toBe(true);
    });

    it("is locked when any topic has been touched", () => {
      expect(
        isModuleTouched({
          moduleId: "m1",
          title: "Mixed",
          learningStatus: "not_started",
          topics: [PRISTINE_TOPIC, { ...PRISTINE_TOPIC, progressAttempts: 2 }],
        }),
      ).toBe(true);
    });
  });
});

describe("partitionModulesForMerge", () => {
  describe("a curriculum mid-study", () => {
    it("locks studied modules and frees the not-yet-touched ones", () => {
      const studied = { ...pristineModule("m1", "Studied"), learningStatus: "probing" };
      const fresh = pristineModule("m2", "Fresh");

      const { lockedModules, freeModuleIds } = partitionModulesForMerge([studied, fresh]);

      expect(lockedModules.map((m) => m.moduleId)).toEqual(["m1"]);
      expect(freeModuleIds).toEqual(["m2"]);
    });
  });

  describe("a fully studied curriculum", () => {
    it("locks every module so studied work is never restructured", () => {
      const a = { ...pristineModule("m1", "A"), learningStatus: "probing" };
      const b = { ...pristineModule("m2", "B"), learningStatus: "done" };

      const { lockedModules, freeModuleIds } = partitionModulesForMerge([a, b]);

      expect(lockedModules).toHaveLength(2);
      expect(freeModuleIds).toEqual([]);
    });
  });

  describe("a curriculum with nothing studied yet", () => {
    it("frees the whole structure for a full rebuild from sources", () => {
      const { freeModuleIds } = partitionModulesForMerge([
        pristineModule("m1", "A"),
        pristineModule("m2", "B"),
      ]);

      expect(freeModuleIds).toEqual(["m1", "m2"]);
    });
  });
});

describe("filterOutLockedModules", () => {
  it("drops modules whose title duplicates a locked one, case-insensitively", () => {
    const result = filterOutLockedModules(
      [{ title: "Messaging" }, { title: "  caching " }, { title: "New Topic" }],
      ["Messaging", "Caching"],
    );

    expect(result.map((m) => m.title)).toEqual(["New Topic"]);
  });
});
