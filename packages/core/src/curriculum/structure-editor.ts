import type { StructureSnapshot, StructureSnapshotModule } from "@post-anki/shared";

// Pure snapshot-mutation logic for Phase 5's tool-calling structure editor.
// Each function here is the testable "hand" behind one Mastra tool
// (`apps/api/src/mastra/structure-editor-tools.ts`) — the tool wrapper only
// validates input, calls the matching function here, and reports the result
// back to the model. Keeping the mutation logic here (not inside the tool's
// `execute` callback) is what makes it directly unit-testable without
// spinning up an agent.

export type StructureEditResult =
  | { ok: true; snapshot: StructureSnapshot }
  | { ok: false; error: string };

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase();
}

function findModuleIndex(snapshot: StructureSnapshot, moduleTitle: string): number {
  const target = normalizeTitle(moduleTitle);

  return snapshot.modules.findIndex((m) => normalizeTitle(m.title) === target);
}

function availableModulesNote(snapshot: StructureSnapshot): string {
  return `available modules: ${snapshot.modules.map((m) => m.title).join(", ") || "(none)"}`;
}

export function applyAddModule(
  snapshot: StructureSnapshot,
  input: { title: string; topics: string[]; afterModuleTitle?: string | null },
): StructureEditResult {
  const newModule: StructureSnapshotModule = {
    title: input.title,
    level: "medium",
    topics: input.topics.map((title) => ({ title, summary: null, suggestedDepth: "working" })),
    tags: [],
  };

  if (!input.afterModuleTitle) {
    return { ok: true, snapshot: { ...snapshot, modules: [...snapshot.modules, newModule] } };
  }

  const idx = findModuleIndex(snapshot, input.afterModuleTitle);

  if (idx === -1) {
    return {
      ok: false,
      error: `no module titled "${input.afterModuleTitle}" found to insert after — ${availableModulesNote(snapshot)}`,
    };
  }

  const modules = [...snapshot.modules];

  modules.splice(idx + 1, 0, newModule);

  return { ok: true, snapshot: { ...snapshot, modules } };
}

export function applyRemoveModule(
  snapshot: StructureSnapshot,
  input: { moduleTitle: string },
): StructureEditResult {
  const idx = findModuleIndex(snapshot, input.moduleTitle);

  if (idx === -1) {
    return {
      ok: false,
      error: `no module titled "${input.moduleTitle}" found — ${availableModulesNote(snapshot)}`,
    };
  }

  if (snapshot.modules.length === 1) {
    return { ok: false, error: "cannot remove the only remaining module — a course needs at least one" };
  }

  return {
    ok: true,
    snapshot: { ...snapshot, modules: snapshot.modules.filter((_, i) => i !== idx) },
  };
}

export function applyRenameModule(
  snapshot: StructureSnapshot,
  input: { moduleTitle: string; newTitle: string },
): StructureEditResult {
  const idx = findModuleIndex(snapshot, input.moduleTitle);

  if (idx === -1) {
    return {
      ok: false,
      error: `no module titled "${input.moduleTitle}" found — ${availableModulesNote(snapshot)}`,
    };
  }

  const modules = snapshot.modules.map((m, i) => (i === idx ? { ...m, title: input.newTitle } : m));

  return { ok: true, snapshot: { ...snapshot, modules } };
}

export function applyMergeModules(
  snapshot: StructureSnapshot,
  input: { moduleTitles: string[]; newTitle: string },
): StructureEditResult {
  if (input.moduleTitles.length < 2) {
    return { ok: false, error: "mergeModules needs at least two module titles to merge" };
  }

  const targets = new Set(input.moduleTitles.map(normalizeTitle));
  const matched = snapshot.modules.filter((m) => targets.has(normalizeTitle(m.title)));

  if (matched.length < new Set(input.moduleTitles.map(normalizeTitle)).size) {
    const foundTitles = new Set(matched.map((m) => normalizeTitle(m.title)));
    const missing = input.moduleTitles.filter((t) => !foundTitles.has(normalizeTitle(t)));

    return {
      ok: false,
      error: `no module(s) titled ${missing.join(", ")} found — ${availableModulesNote(snapshot)}`,
    };
  }

  const merged: StructureSnapshotModule = {
    title: input.newTitle,
    level: matched[0]!.level,
    topics: matched.flatMap((m) => m.topics),
    tags: Array.from(new Set(matched.flatMap((m) => m.tags ?? []))),
  };

  let inserted = false;
  const modules: StructureSnapshotModule[] = [];

  for (const m of snapshot.modules) {
    if (targets.has(normalizeTitle(m.title))) {
      if (!inserted) {
        modules.push(merged);
        inserted = true;
      }

      continue;
    }

    modules.push(m);
  }

  return { ok: true, snapshot: { ...snapshot, modules } };
}

export function applyPromoteTopicToModule(
  snapshot: StructureSnapshot,
  input: { moduleTitle: string; topicTitle: string },
): StructureEditResult {
  const moduleIdx = findModuleIndex(snapshot, input.moduleTitle);

  if (moduleIdx === -1) {
    return {
      ok: false,
      error: `no module titled "${input.moduleTitle}" found — ${availableModulesNote(snapshot)}`,
    };
  }

  const sourceModule = snapshot.modules[moduleIdx]!;
  const target = normalizeTitle(input.topicTitle);
  const topicIdx = sourceModule.topics.findIndex((t) => normalizeTitle(t.title) === target);

  if (topicIdx === -1) {
    return {
      ok: false,
      error: `no topic titled "${input.topicTitle}" found in module "${sourceModule.title}" — available topics: ${sourceModule.topics.map((t) => t.title).join(", ") || "(none)"}`,
    };
  }

  const topic = sourceModule.topics[topicIdx]!;
  const updatedSourceModule: StructureSnapshotModule = {
    ...sourceModule,
    topics: sourceModule.topics.filter((_, i) => i !== topicIdx),
  };
  const promotedModule: StructureSnapshotModule = {
    title: topic.title,
    level: sourceModule.level,
    topics: [],
    tags: [],
  };

  const modules = snapshot.modules.map((m, i) => (i === moduleIdx ? updatedSourceModule : m));

  modules.splice(moduleIdx + 1, 0, promotedModule);

  return { ok: true, snapshot: { ...snapshot, modules } };
}

export interface SplitModuleOutcome {
  remainingSnapshot: StructureSnapshot;
  extractedModule: StructureSnapshotModule;
}

export type SplitModuleResult =
  | { ok: true; result: SplitModuleOutcome }
  | { ok: false; error: string };

/**
 * The pure half of `splitModuleIntoNewCourse` (the one tool that reaches
 * outside the current snapshot) — extracting the module from the current
 * draft is a pure transform; actually creating the new `curricula` row and
 * its seed turn is a DB side effect the caller performs after this succeeds.
 */
export function applySplitModuleOut(
  snapshot: StructureSnapshot,
  input: { moduleTitle: string },
): SplitModuleResult {
  const idx = findModuleIndex(snapshot, input.moduleTitle);

  if (idx === -1) {
    return {
      ok: false,
      error: `no module titled "${input.moduleTitle}" found — ${availableModulesNote(snapshot)}`,
    };
  }

  if (snapshot.modules.length === 1) {
    return { ok: false, error: "cannot split out the only remaining module" };
  }

  const extractedModule = snapshot.modules[idx]!;
  const remainingSnapshot: StructureSnapshot = {
    ...snapshot,
    modules: snapshot.modules.filter((_, i) => i !== idx),
  };

  return { ok: true, result: { remainingSnapshot, extractedModule } };
}
