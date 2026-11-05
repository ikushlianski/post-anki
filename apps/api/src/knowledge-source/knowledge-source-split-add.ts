import { SPLIT_MIN_CHARS } from "./long-paste-split.config.js";
import { splitImportKeyBase } from "./long-paste-split.js";
import { splitLongPaste } from "./long-paste-split.orchestrator.js";
import { findEarlierSplitSource, type EarlierKnowledgeSource } from "./knowledge-source-duplicate.repo.js";
import { withPageTitleKeepingText } from "./knowledge-source-page-context.js";
import { insertSplitKnowledgeSources, type KnowledgeSource } from "./knowledge-source.repo.js";

export interface AddSplitSourcesInput {
  text: string;
  title: string | undefined;
  subjectId: string | null;
  modelId: string | null;
  sourceUrl: string | null;
  targetPhrases: string[] | undefined;
  force: boolean;
}

export type AddSplitSourcesResult =
  | { kind: "duplicate"; earlier: EarlierKnowledgeSource }
  | { kind: "created"; sources: KnowledgeSource[] }
  | null;

function partTitle(pageTitle: string | undefined, sectionTitle: string): string {
  const page = (pageTitle ?? "").replace(/\s+/g, " ").trim();

  return page.length === 0 ? sectionTitle : `${page} - ${sectionTitle}`;
}

export async function findEarlierSplitImport(input: {
  text: string;
  subjectId: string | null;
  force: boolean;
}): Promise<EarlierKnowledgeSource | null> {
  if (input.force || input.text.length < SPLIT_MIN_CHARS) return null;

  return findEarlierSplitSource(splitImportKeyBase(input.subjectId, input.text));
}

export async function addSplitSources(input: AddSplitSourcesInput): Promise<AddSplitSourcesResult> {
  if (input.text.length < SPLIT_MIN_CHARS) return null;

  const importKeyBase = input.force ? null : splitImportKeyBase(input.subjectId, input.text);
  const earlier = importKeyBase === null ? null : await findEarlierSplitSource(importKeyBase);

  if (earlier !== null) return { kind: "duplicate", earlier };

  const parts = await splitLongPaste(input.text);

  if (parts === null) return null;

  const sources = await insertSplitKnowledgeSources(
    parts.map((part) => withPageTitleKeepingText(part.text, partTitle(input.title, part.title))),
    {
      subjectId: input.subjectId,
      modelId: input.modelId,
      sourceUrl: input.sourceUrl,
      targetPhrases: input.targetPhrases,
      importKeyBase,
    },
  );

  if (sources.length > 0) return { kind: "created", sources };

  const raced = importKeyBase === null ? null : await findEarlierSplitSource(importKeyBase);

  return raced === null ? null : { kind: "duplicate", earlier: raced };
}
