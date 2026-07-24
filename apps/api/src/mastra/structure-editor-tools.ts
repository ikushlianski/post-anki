import { z } from "zod";
import { createTool } from "@mastra/core/tools";
import type { SplitSuggestion, StructureSnapshot } from "@post-anki/shared";
import {
  applyAddModule,
  applyMergeModules,
  applyPromoteTopicToModule,
  applyRemoveModule,
  applyRenameModule,
  applySplitModuleOut,
} from "@post-anki/core";
import { log } from "../shared/log.js";
import { createSplitOutCurriculum, insertStructureTurn } from "../curriculum/curriculum.repo.js";

// Phase 5's tool-calling structure editor — the first tool-using agent in
// this codebase. Every tool here except `splitModuleIntoNewCourse` operates
// ONLY on the in-memory `state.snapshot` for the CURRENT curriculum's draft
// (never the real `modules`/`topics` tables — `confirm-structure` remains
// the sole writer of those). `state` is a plain mutable object the caller
// (`submitStructureTurn`) owns and persists once the whole tool-calling turn
// finishes, so every tool call in this turn shares and updates the same
// snapshot.

export interface StructureEditorState {
  snapshot: StructureSnapshot;
  splitSuggestion: SplitSuggestion | null;
  toolActions: string[];
}

export interface StructureEditorToolsDeps {
  state: StructureEditorState;
  curriculumId: string;
  subjectId: string;
  curriculumName: string;
  /**
   * The pre-existing "regenerate the whole draft" mechanism, reused as one
   * tool among several rather than the only path — kept for free-text
   * content steering that doesn't map to any of the structural edit tools
   * (e.g. "make module 2 lean more into production concerns").
   */
  regenerateGuided: (guidance: string) => Promise<StructureSnapshot | null>;
}

function moduleTitles(snapshot: StructureSnapshot): string[] {
  return snapshot.modules.map((m) => m.title);
}

function logToolResult(
  curriculumId: string,
  toolName: string,
  args: unknown,
  before: string[],
  after: string[],
): void {
  log.info(
    { curriculumId, tool: toolName, args, modulesBefore: before, modulesAfter: after },
    "structure_editor_tool_call",
  );
}

/**
 * A model can request several tool calls within one step, and Mastra can
 * run their `execute` functions concurrently. Every tool here reads and
 * writes the SAME `state.snapshot`, so unserialized concurrent execution is
 * a real read-modify-write race — verified directly: a two-group course
 * split silently lost one group's removal before this existed. `enqueue`
 * chains every tool call in this turn onto one promise tail, so they always
 * run one at a time, in the order the model requested them, regardless of
 * how the provider/SDK schedules them.
 */
function createQueue() {
  let tail: Promise<unknown> = Promise.resolve();

  return function enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = tail.then(fn, fn);

    tail = run.then(
      () => undefined,
      () => undefined,
    );

    return run;
  };
}

export function createStructureEditorTools(deps: StructureEditorToolsDeps) {
  const { state, curriculumId } = deps;
  const enqueue = createQueue();

  const addModule = createTool({
    id: "addModule",
    description:
      "Add a brand-new module to the CURRENT draft. Use when the learner asks for a topic area that isn't covered yet.",
    inputSchema: z.object({
      title: z.string(),
      topics: z.array(z.string()).default([]),
      afterModuleTitle: z
        .string()
        .nullable()
        .optional()
        .describe("Insert right after this existing module's title, or omit to append at the end."),
    }),
    execute: (input) =>
      enqueue(async () => {
        const before = moduleTitles(state.snapshot);
        const result = applyAddModule(state.snapshot, {
          title: input.title,
          topics: input.topics ?? [],
          afterModuleTitle: input.afterModuleTitle ?? null,
        });

        if (!result.ok) {
          logToolResult(curriculumId, "addModule", input, before, before);
          return { ok: false, error: result.error };
        }

        state.snapshot = result.snapshot;
        state.toolActions.push(`added module "${input.title}"`);
        logToolResult(curriculumId, "addModule", input, before, moduleTitles(state.snapshot));

        return { ok: true, modules: moduleTitles(state.snapshot) };
      }),
  });

  const removeModule = createTool({
    id: "removeModule",
    description: "Remove an existing module from the CURRENT draft entirely, including its topics.",
    inputSchema: z.object({ moduleTitle: z.string() }),
    execute: (input) =>
      enqueue(async () => {
        const before = moduleTitles(state.snapshot);
        const result = applyRemoveModule(state.snapshot, input);

        if (!result.ok) {
          logToolResult(curriculumId, "removeModule", input, before, before);
          return { ok: false, error: result.error };
        }

        state.snapshot = result.snapshot;
        state.toolActions.push(`removed module "${input.moduleTitle}"`);
        logToolResult(curriculumId, "removeModule", input, before, moduleTitles(state.snapshot));

        return { ok: true, modules: moduleTitles(state.snapshot) };
      }),
  });

  const renameModule = createTool({
    id: "renameModule",
    description: "Rename an existing module in the CURRENT draft. Topics are unaffected.",
    inputSchema: z.object({ moduleTitle: z.string(), newTitle: z.string() }),
    execute: (input) =>
      enqueue(async () => {
        const before = moduleTitles(state.snapshot);
        const result = applyRenameModule(state.snapshot, input);

        if (!result.ok) {
          logToolResult(curriculumId, "renameModule", input, before, before);
          return { ok: false, error: result.error };
        }

        state.snapshot = result.snapshot;
        state.toolActions.push(`renamed "${input.moduleTitle}" to "${input.newTitle}"`);
        logToolResult(curriculumId, "renameModule", input, before, moduleTitles(state.snapshot));

        return { ok: true, modules: moduleTitles(state.snapshot) };
      }),
  });

  const mergeModules = createTool({
    id: "mergeModules",
    description:
      "Combine two or more existing modules into one new module carrying all their topics. Use when the learner says two modules overlap or should be one.",
    inputSchema: z.object({ moduleTitles: z.array(z.string()).min(2), newTitle: z.string() }),
    execute: (input) =>
      enqueue(async () => {
        const before = moduleTitles(state.snapshot);
        const result = applyMergeModules(state.snapshot, input);

        if (!result.ok) {
          logToolResult(curriculumId, "mergeModules", input, before, before);
          return { ok: false, error: result.error };
        }

        state.snapshot = result.snapshot;
        state.toolActions.push(`merged ${input.moduleTitles.join(", ")} into "${input.newTitle}"`);
        logToolResult(curriculumId, "mergeModules", input, before, moduleTitles(state.snapshot));

        return { ok: true, modules: moduleTitles(state.snapshot) };
      }),
  });

  const promoteTopicToModule = createTool({
    id: "promoteTopicToModule",
    description:
      "Turn one topic within a module into its own standalone module in the same curriculum's draft. Use when the learner says a topic deserves more than a subtopic's treatment, but should still stay part of THIS course.",
    inputSchema: z.object({ moduleTitle: z.string(), topicTitle: z.string() }),
    execute: (input) =>
      enqueue(async () => {
        const before = moduleTitles(state.snapshot);
        const result = applyPromoteTopicToModule(state.snapshot, input);

        if (!result.ok) {
          logToolResult(curriculumId, "promoteTopicToModule", input, before, before);
          return { ok: false, error: result.error };
        }

        state.snapshot = result.snapshot;
        state.toolActions.push(`promoted topic "${input.topicTitle}" to its own module`);
        logToolResult(curriculumId, "promoteTopicToModule", input, before, moduleTitles(state.snapshot));

        return { ok: true, modules: moduleTitles(state.snapshot) };
      }),
  });

  const splitModuleIntoNewCourse = createTool({
    id: "splitModuleIntoNewCourse",
    description:
      "The ONE tool that reaches beyond this draft: pulls a module out of the CURRENT course and creates a brand-new, separate course from it (its own curriculum, starting in structure shaping with that module as its first draft). Use only when the learner explicitly agrees a module should become its own course — never as a first suggestion (use suggestSplitIntoCourses for that).",
    inputSchema: z.object({ moduleTitle: z.string(), newCourseName: z.string() }),
    execute: (input) =>
      enqueue(async () => {
        const before = moduleTitles(state.snapshot);
        const result = applySplitModuleOut(state.snapshot, { moduleTitle: input.moduleTitle });

        if (!result.ok) {
          logToolResult(curriculumId, "splitModuleIntoNewCourse", input, before, before);
          return { ok: false, error: result.error };
        }

        const { remainingSnapshot, extractedModule } = result.result;
        const strictOrder = state.snapshot.strictOrder;

        state.snapshot = remainingSnapshot;
        state.toolActions.push(
          `split module "${input.moduleTitle}" into a new course: "${input.newCourseName}"`,
        );
        logToolResult(
          curriculumId,
          "splitModuleIntoNewCourse",
          input,
          before,
          moduleTitles(state.snapshot),
        );

        const newCurriculum = await createSplitOutCurriculum(deps.subjectId, input.newCourseName);

        await insertStructureTurn(newCurriculum.id, {
          role: "assistant",
          message: `Split out of "${deps.curriculumName}" as its own course — starting from the "${input.moduleTitle}" module.`,
          structureSnapshot: {
            modules: [extractedModule],
            strictOrder,
          },
        });

        log.info(
          { curriculumId, newCurriculumId: newCurriculum.id, newCurriculumName: input.newCourseName },
          "structure_editor_split_course_created",
        );

        return { ok: true, newCurriculumId: newCurriculum.id, modules: moduleTitles(state.snapshot) };
      }),
  });

  const suggestSplitIntoCourses = createTool({
    id: "suggestSplitIntoCourses",
    description:
      "PROPOSAL ONLY — records a suggestion to split the CURRENT draft into two or more separate courses, grouped by module. Does NOT create anything. Use this when the draft has grown past a reasonable study-time budget (roughly 4-8 weeks), instead of silently letting it keep growing. The learner must confirm in a later message before you call splitModuleIntoNewCourse.",
    inputSchema: z.object({
      reason: z.string(),
      groups: z
        .array(z.object({ courseName: z.string(), moduleTitles: z.array(z.string()).min(1) }))
        .min(2),
    }),
    execute: (input) =>
      enqueue(async () => {
        const known = new Set(moduleTitles(state.snapshot).map((t) => t.trim().toLowerCase()));
        const unknownTitles = input.groups
          .flatMap((g) => g.moduleTitles)
          .filter((t) => !known.has(t.trim().toLowerCase()));

        if (unknownTitles.length > 0) {
          return {
            ok: false,
            error: `these module titles don't exist in the current draft: ${unknownTitles.join(", ")}`,
          };
        }

        state.splitSuggestion = { reason: input.reason, groups: input.groups };
        state.toolActions.push(
          `suggested splitting into ${input.groups.length} courses: ${input.groups.map((g) => g.courseName).join(", ")}`,
        );
        log.info({ curriculumId, groups: input.groups }, "structure_editor_split_suggested");

        return { ok: true, recorded: true };
      }),
  });

  const regenerateStructure = createTool({
    id: "regenerateStructure",
    description:
      "Fallback for free-text content steering that isn't a structural reshape any other tool covers (e.g. 'add more depth on X', 'make this beginner-friendlier', 'reconsider the whole thing'). Regenerates the full draft guided by the given instruction, grounded in the same source material and trusted-source search as the original draft.",
    inputSchema: z.object({ guidance: z.string() }),
    execute: (input) =>
      enqueue(async () => {
        const before = moduleTitles(state.snapshot);
        const regenerated = await deps.regenerateGuided(input.guidance);

        if (!regenerated) {
          logToolResult(curriculumId, "regenerateStructure", input, before, before);
          return { ok: false, error: "regeneration failed — try a more specific instruction" };
        }

        state.snapshot = regenerated;
        state.toolActions.push("regenerated the draft based on your message");
        logToolResult(curriculumId, "regenerateStructure", input, before, moduleTitles(state.snapshot));

        return { ok: true, modules: moduleTitles(state.snapshot) };
      }),
  });

  return {
    addModule,
    removeModule,
    renameModule,
    mergeModules,
    promoteTopicToModule,
    splitModuleIntoNewCourse,
    suggestSplitIntoCourses,
    regenerateStructure,
  };
}
