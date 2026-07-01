export interface PromptContext {
  curriculumName: string;
  curriculumDescription: string | null;
  subjectName: string;
  subjectDescription: string | null;
}

function nonEmpty(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function contextHeader(ctx: PromptContext): string[] {
  const lines: string[] = [];

  if (ctx.subjectName.trim().length > 0) {
    lines.push(`Subject: ${ctx.subjectName.trim()}`);
  }

  const subjectDescription = nonEmpty(ctx.subjectDescription);

  if (subjectDescription) {
    lines.push(`Subject context: ${subjectDescription}`);
  }

  lines.push(`Curriculum: ${ctx.curriculumName}`);

  const curriculumDescription = nonEmpty(ctx.curriculumDescription);

  if (curriculumDescription) {
    lines.push(`Curriculum context: ${curriculumDescription}`);
  }

  return lines;
}

export function buildParsePrompt(ctx: PromptContext, sourceText: string): string {
  return [
    ...contextHeader(ctx),
    "",
    "Pasted source material:",
    sourceText.length > 0
      ? sourceText
      : "(no sources pasted — propose a sensible module/topic skeleton for this curriculum, guided by the subject and curriculum context above)",
  ].join("\n");
}

export interface LockedModuleOutline {
  title: string;
  topics: string[];
}

function lockedOutline(lockedModules: LockedModuleOutline[]): string {
  if (lockedModules.length === 0) {
    return "(nothing locked yet — you may shape the whole curriculum)";
  }

  return lockedModules
    .map((m) => {
      const topics = m.topics.map((t) => `    - ${t}`).join("\n");

      return topics.length > 0 ? `- ${m.title}\n${topics}` : `- ${m.title}`;
    })
    .join("\n");
}

export function buildMergePrompt(
  ctx: PromptContext,
  lockedModules: LockedModuleOutline[],
  sourceText: string,
): string {
  return [
    ...contextHeader(ctx),
    "",
    "These modules are already being studied or have been confirmed. KEEP them as-is — do NOT repeat, rename, or restructure them:",
    lockedOutline(lockedModules),
    "",
    "All source material gathered for this curriculum so far:",
    sourceText.length > 0 ? sourceText : "(no source text available)",
    "",
    "Rebuild the REST of the curriculum from this material: revise and extend the not-yet-studied areas, and add any new modules/topics the material now warrants. Produce ONLY modules that are NOT in the locked list above. If the material adds nothing beyond what is locked, return an empty modules array.",
  ].join("\n");
}
