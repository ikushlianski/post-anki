import { NonRetriableError } from "inngest";
import { getDb } from "../db/client.js";
import { log } from "../shared/log.js";
import { createInngestClient } from "../shared/inngest-client.js";
import { isDurableExtractionEnabled } from "../knowledge-bit/durable-extraction.flag.js";
import { resolveDeckSubjectId } from "../mcp/business-deck-mapping.js";
import {
  findAnkiTextKeysTakenElsewhere,
  findSourcesByImportKeys,
  insertKeyedKnowledgeSources,
} from "../knowledge-source/knowledge-source-keyed-insert.repo.js";
import { kickSourcesAfterAdd } from "../knowledge-source/knowledge-source-kick.js";
import { ankiImportRequestedEvent, importIdSchema } from "./anki-import.events.js";
import { ANKI_IMPORT_FINISH_TIMEOUT, ANKI_IMPORT_RETRIES } from "./anki-import.limits.js";
import {
  countImportNotesByStatus,
  listStagedDecks,
  markNotesDuplicate,
  markNotesImported,
  takeNextStagedNotes,
} from "./anki-import.repo.js";
import { importBatchStep, planStep, summaryStep, type AnkiImportDeps } from "./anki-import.steps.js";

const inngest = createInngestClient();

function defaultDeps(): AnkiImportDeps {
  return {
    isDurableEnabled: () => isDurableExtractionEnabled(),
    countByStatus: (importId) => countImportNotesByStatus(importId),
    listStagedDecks: (importId) => listStagedDecks(importId),
    takeNext: (importId, limit) => takeNextStagedNotes(importId, limit),
    resolveDeck: (deck) => resolveDeckSubjectId(deck),
    insertKeyed: (items, subjectId) => insertKeyedKnowledgeSources(items, subjectId, getDb()),
    findSources: (keys) => findSourcesByImportKeys(keys),
    findTakenTextKeys: (textKeys, ownImportKeys) => findAnkiTextKeysTakenElsewhere(textKeys, ownImportKeys),
    markDuplicates: (ids) => markNotesDuplicate(ids),
    markImported: (entries) => markNotesImported(entries),
    kick: (sourceIds) => kickSourcesAfterAdd(sourceIds),
  };
}

export const ankiImportFunction = inngest.createFunction(
  {
    id: "import-anki-notes",
    retries: ANKI_IMPORT_RETRIES,
    triggers: [{ event: ankiImportRequestedEvent }],
    concurrency: [{ limit: 1 }],
    singleton: { key: "event.data.importId", mode: "skip" },
    timeouts: { finish: ANKI_IMPORT_FINISH_TIMEOUT },
  },
  async ({ event, step }) => {
    const parsed = importIdSchema.safeParse(event.data.importId);

    if (!parsed.success) {
      throw new NonRetriableError("invalid_import_id");
    }

    const importId = parsed.data;
    const deps = defaultDeps();
    const plan = await step.run("plan", () => planStep(importId, deps));

    for (let index = 0; index < plan.batchCount; index += 1) {
      const outcome = await step.run(`batch-${index}`, () => importBatchStep(importId, deps));

      log.info({ importId, batch: index, of: plan.batchCount, ...outcome }, "anki_import_batch_done");
    }

    return step.run("summary", () => summaryStep(importId, deps));
  },
);
