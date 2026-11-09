import { planTxtImport, TXT_IMPORT_MESSAGES, type TxtImportRefusal } from "./txt-import.plan.js";
import type { StagedNoteRow } from "../anki-import/anki-import-staging.js";
import type { KeyedKnowledgeSourceItem } from "../knowledge-source/knowledge-source-keyed-insert.repo.js";

const CHUNK_SIZE = 200;

export interface TxtImportDeps {
  subjectExists: (subjectId: string) => Promise<boolean>;
  stageNotes: (importId: string, rows: StagedNoteRow[]) => Promise<number>;
  insertSources: (items: KeyedKnowledgeSourceItem[], subjectId: string) => Promise<{ id: string }[]>;
  kick: (sourceIds: string[]) => Promise<void>;
  sendImportEvent: (importId: string) => Promise<void>;
}

export type TxtImportResult =
  | { status: 200; body: { kind: "anki"; importId: string; parsed: number; skippedEmpty: number; newlyStaged: number } }
  | { status: 200; body: { kind: "source"; created: boolean } }
  | { status: 400 | 502; body: { error: string; message: string } };

function refused(reason: TxtImportRefusal): TxtImportResult {
  return { status: 400, body: { error: reason, message: TXT_IMPORT_MESSAGES[reason] } };
}

export async function runTxtImport(
  input: { text: string; subjectId: string | null },
  deps: TxtImportDeps,
): Promise<TxtImportResult> {
  const plan = planTxtImport(input.text);

  if (plan.kind === "refused") return refused(plan.reason);

  if (plan.kind === "single") {
    if (!input.subjectId || !(await deps.subjectExists(input.subjectId))) {
      return { status: 400, body: { error: "subject_required", message: "Choose a subject for this file." } };
    }

    const created = await deps.insertSources([{ importKey: plan.importKey, rawText: plan.text }], input.subjectId);

    if (created.length > 0) await deps.kick(created.map((source) => source.id));

    return { status: 200, body: { kind: "source", created: created.length > 0 } };
  }

  let newlyStaged = 0;

  for (let start = 0; start < plan.rows.length; start += CHUNK_SIZE) {
    newlyStaged += await deps.stageNotes(plan.importId, plan.rows.slice(start, start + CHUNK_SIZE));
  }

  try {
    await deps.sendImportEvent(plan.importId);
  } catch {
    return {
      status: 502,
      body: { error: "import_not_started", message: "The notes were saved but the import could not start. Upload the file again to retry." },
    };
  }

  return {
    status: 200,
    body: { kind: "anki", importId: plan.importId, parsed: plan.parsed, skippedEmpty: plan.skippedEmpty, newlyStaged },
  };
}
