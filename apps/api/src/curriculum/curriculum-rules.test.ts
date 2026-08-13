import { describe, it, expect } from "vitest";
import {
  isSourceMandateUnmet,
  isTopicTouched,
  isModuleTouched,
  partitionModulesForMerge,
  filterOutLockedModules,
  hasStudyableContent,
  isResearchAndSourcesConflict,
  resolveCurriculumOrigin,
  looksLikeLlmsTxtContent,
  shouldIncludeTopicByDefault,
  isDocUrlAndResearchTopicConflict,
  resolveRetryResearchSource,
  isApproveSourcesBlocked,
  isPastedMaterialAndResearchConflict,
  isPastedMaterialAndSourcesConflict,
  resolveSourceMergeAction,
  type ModuleTouchState,
  type TopicTouchState,
  type StudyableModule,
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

describe("hasStudyableContent", () => {
  describe("a curriculum where every topic is excluded", () => {
    it("is not studyable when every module has at least one topic and none are included", () => {
      const modules: StudyableModule[] = [
        { topics: [{ included: false }, { included: false }] },
        { topics: [{ included: false }] },
      ];

      expect(hasStudyableContent(modules)).toBe(false);
    });
  });

  describe("a curriculum with one included topic anywhere", () => {
    it("is studyable, matching today's common case", () => {
      const modules: StudyableModule[] = [
        { topics: [{ included: false }] },
        { topics: [{ included: true }] },
      ];

      expect(hasStudyableContent(modules)).toBe(true);
    });
  });

  describe("a curriculum containing a topic-less module", () => {
    it("is studyable on the topic-less module alone, regardless of other modules' topics", () => {
      const modules: StudyableModule[] = [
        { topics: [] },
        { topics: [{ included: false }] },
      ];

      expect(hasStudyableContent(modules)).toBe(true);
    });
  });

  describe("a curriculum with no modules at all", () => {
    it("is not studyable", () => {
      expect(hasStudyableContent([])).toBe(false);
    });
  });
});

describe("isResearchAndSourcesConflict", () => {
  describe("a request where research was triggered and sources were pasted", () => {
    it("is a conflict", () => {
      expect(isResearchAndSourcesConflict(true, 1)).toBe(true);
    });
  });

  describe("a request where research was triggered with no pasted sources", () => {
    it("is not a conflict", () => {
      expect(isResearchAndSourcesConflict(true, 0)).toBe(false);
    });
  });

  describe("a request with only sources, research not triggered", () => {
    it("is not a conflict", () => {
      expect(isResearchAndSourcesConflict(false, 2)).toBe(false);
    });
  });

  describe("a request with neither", () => {
    it("is not a conflict", () => {
      expect(isResearchAndSourcesConflict(false, 0)).toBe(false);
    });
  });
});

describe("resolveCurriculumOrigin", () => {
  describe("a curriculum with a web_research source", () => {
    it("is research-origin regardless of what else is present", () => {
      expect(resolveCurriculumOrigin(["web_research"])).toBe("research");
      expect(resolveCurriculumOrigin(["link", "web_research"])).toBe("research");
    });
  });

  describe("a curriculum with an llms_txt source", () => {
    it("is research-origin, same as a web_research source", () => {
      expect(resolveCurriculumOrigin(["llms_txt"])).toBe("research");
      expect(resolveCurriculumOrigin(["link", "llms_txt"])).toBe("research");
    });
  });

  describe("a curriculum with only hand-authored sources", () => {
    it("is sources-origin", () => {
      expect(resolveCurriculumOrigin(["link", "text"])).toBe("sources");
    });
  });

  describe("a curriculum with no sources at all", () => {
    it("defaults to sources-origin", () => {
      expect(resolveCurriculumOrigin([])).toBe("sources");
    });
  });
});

describe("looksLikeLlmsTxtContent", () => {
  describe("a real llms.txt-shaped body", () => {
    it("is trusted when it has enough plain-text content", () => {
      const body = [
        "# Temporal",
        "",
        "> Temporal is a durable execution platform.",
        "",
        "## Docs",
        "- [Getting started](https://docs.temporal.io/getting-started): intro guide",
        "- [Workflows](https://docs.temporal.io/workflows): core concepts",
      ].join("\n");

      expect(looksLikeLlmsTxtContent(body)).toBe(true);
    });
  });

  describe("a soft-404 that 200s with the site's normal HTML shell", () => {
    it("is rejected because it looks like an HTML document", () => {
      const body = `<!doctype html><html><head><title>Docs</title></head><body>${"x".repeat(500)}</body></html>`;

      expect(looksLikeLlmsTxtContent(body)).toBe(false);
    });

    it("is rejected for an uppercase or spaced-out doctype too", () => {
      const body = `<!DOCTYPE HTML><html>${"x".repeat(500)}</html>`;

      expect(looksLikeLlmsTxtContent(body)).toBe(false);
    });
  });

  describe("an empty or near-empty file", () => {
    it("is rejected for being too short to be a real map", () => {
      expect(looksLikeLlmsTxtContent("")).toBe(false);
      expect(looksLikeLlmsTxtContent("Not found")).toBe(false);
    });
  });
});

describe("shouldIncludeTopicByDefault", () => {
  describe("a module whose level matches the preferred level", () => {
    it("pre-includes its topics", () => {
      expect(shouldIncludeTopicByDefault("medium", "medium")).toBe(true);
    });
  });

  describe("a module whose level does not match the preferred level", () => {
    it("does not pre-include its topics", () => {
      expect(shouldIncludeTopicByDefault("basic", "medium")).toBe(false);
      expect(shouldIncludeTopicByDefault("advanced", "medium")).toBe(false);
    });
  });

  describe("no preference given", () => {
    it("never pre-includes, matching the shipped all-excluded default", () => {
      expect(shouldIncludeTopicByDefault("medium", null)).toBe(false);
      expect(shouldIncludeTopicByDefault("medium", undefined)).toBe(false);
    });
  });

  describe("a module with no level tag", () => {
    it("never pre-includes, even if a preference was given", () => {
      expect(shouldIncludeTopicByDefault(null, "medium")).toBe(false);
      expect(shouldIncludeTopicByDefault(undefined, "medium")).toBe(false);
    });
  });
});

describe("isDocUrlAndResearchTopicConflict", () => {
  describe("both a docUrl and a legacy researchTopic are set", () => {
    it("is a conflict", () => {
      expect(
        isDocUrlAndResearchTopicConflict("https://docs.temporal.io", "Temporal"),
      ).toBe(true);
    });
  });

  describe("only a docUrl is set", () => {
    it("is not a conflict", () => {
      expect(isDocUrlAndResearchTopicConflict("https://docs.temporal.io", null)).toBe(
        false,
      );
    });
  });

  describe("only a researchTopic is set", () => {
    it("is not a conflict", () => {
      expect(isDocUrlAndResearchTopicConflict(null, "Temporal")).toBe(false);
    });
  });

  describe("neither is set", () => {
    it("is not a conflict", () => {
      expect(isDocUrlAndResearchTopicConflict(null, null)).toBe(false);
      expect(isDocUrlAndResearchTopicConflict(undefined, undefined)).toBe(false);
    });
  });
});

describe("resolveRetryResearchSource", () => {
  describe("a docs-URL-driven curriculum's prior research source", () => {
    it("re-derives the original docUrl from the stored value", () => {
      const result = resolveRetryResearchSource(
        [{ kind: "llms_txt", value: "https://docs.temporal.io/dev-guide" }],
        "Temporal",
      );

      expect(result).toEqual({
        mode: "url",
        docUrl: "https://docs.temporal.io/dev-guide",
        name: "Temporal",
      });
    });

    it("also recognizes a docUrl-anchored web_research row as URL-shaped", () => {
      const result = resolveRetryResearchSource(
        [{ kind: "web_research", value: "https://docs.temporal.io" }],
        "Temporal",
      );

      expect(result).toEqual({
        mode: "url",
        docUrl: "https://docs.temporal.io",
        name: "Temporal",
      });
    });
  });

  describe("a legacy bare-name curriculum's prior research source", () => {
    it("falls back to today's exact name-based retry", () => {
      const result = resolveRetryResearchSource(
        [{ kind: "web_research", value: "Temporal" }],
        "Temporal",
      );

      expect(result).toEqual({ mode: "name", name: "Temporal" });
    });
  });

  describe("no prior research source rows at all", () => {
    it("falls back to name-based retry", () => {
      expect(resolveRetryResearchSource([], "Temporal")).toEqual({
        mode: "name",
        name: "Temporal",
      });
    });
  });
});

describe("isApproveSourcesBlocked", () => {
  describe("with zero approvable sources", () => {
    it("blocks generation without an explicit override", () => {
      expect(isApproveSourcesBlocked(0, false)).toBe(true);
    });

    it("lets the learner proceed once they explicitly override", () => {
      expect(isApproveSourcesBlocked(0, true)).toBe(false);
    });
  });

  describe("with at least one approvable source", () => {
    it("never blocks, override or not", () => {
      expect(isApproveSourcesBlocked(1, false)).toBe(false);
      expect(isApproveSourcesBlocked(3, true)).toBe(false);
    });
  });
});

describe("isPastedMaterialAndResearchConflict", () => {
  describe("pasted material alongside a triggered research path", () => {
    it("is a conflict", () => {
      expect(isPastedMaterialAndResearchConflict("some article text", true)).toBe(true);
    });
  });

  describe("pasted material with no research triggered", () => {
    it("is not a conflict", () => {
      expect(isPastedMaterialAndResearchConflict("some article text", false)).toBe(false);
    });
  });

  describe("whitespace-only pasted material", () => {
    it("does not count as pasted material at all", () => {
      expect(isPastedMaterialAndResearchConflict("   ", true)).toBe(false);
    });
  });

  describe("no pasted material", () => {
    it("is never a conflict, research triggered or not", () => {
      expect(isPastedMaterialAndResearchConflict(null, true)).toBe(false);
      expect(isPastedMaterialAndResearchConflict(undefined, false)).toBe(false);
    });
  });
});

describe("isPastedMaterialAndSourcesConflict", () => {
  describe("pasted material alongside explicit pasted sources", () => {
    it("is a conflict", () => {
      expect(isPastedMaterialAndSourcesConflict("some article text", 1)).toBe(true);
    });
  });

  describe("pasted material with zero sources", () => {
    it("is not a conflict", () => {
      expect(isPastedMaterialAndSourcesConflict("some article text", 0)).toBe(false);
    });
  });

  describe("no pasted material", () => {
    it("is never a conflict, regardless of source count", () => {
      expect(isPastedMaterialAndSourcesConflict(null, 2)).toBe(false);
      expect(isPastedMaterialAndSourcesConflict(undefined, 0)).toBe(false);
    });
  });
});

describe("resolveSourceMergeAction", () => {
  it("queues new sources for approval instead of merging while the source list is still under review", () => {
    expect(resolveSourceMergeAction("awaiting_source_approval")).toBe("queue_for_approval");
  });

  it("blocks a merge while the structure chat is shaping the curriculum", () => {
    expect(resolveSourceMergeAction("shaping_structure")).toBe("blocked_by_shaping");
  });

  it("merges straight in for every other status, including an already-confirmed curriculum", () => {
    expect(resolveSourceMergeAction("draft")).toBe("merge");
    expect(resolveSourceMergeAction("curating")).toBe("merge");
    expect(resolveSourceMergeAction("ready")).toBe("merge");
    expect(resolveSourceMergeAction("confirmed")).toBe("merge");
    expect(resolveSourceMergeAction("failed")).toBe("merge");
  });
});
