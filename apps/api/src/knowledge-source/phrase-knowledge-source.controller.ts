import type http from "node:http";
import { parsePhraseLines } from "@post-anki/core";
import { createPhraseSourcesInput, MAX_PHRASE_LINE_LENGTH } from "@post-anki/shared";
import { readJsonBody, sendJson } from "../shared/http.js";
import { ensureEnglishForItSubject } from "../subject/seed/english-sub-subjects.seed.js";
import { importPhraseLines } from "./phrase-import.service.js";

export async function handleCreateKnowledgeSourcesFromPhrases(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const body = await readJsonBody(req, createPhraseSourcesInput);

  if (!body.ok) {
    sendJson(res, 400, { error: "invalid_input", message: body.issues });
    return;
  }

  const lines = body.data.lines.map((line) => (line.length > MAX_PHRASE_LINE_LENGTH ? "" : line));

  if (parsePhraseLines(lines).phrases.length === 0) {
    sendJson(res, 400, { error: "invalid_input", message: "lines: no phrases found" });
    return;
  }

  const subjectId = await ensureEnglishForItSubject();
  const { importedKeys: _importedKeys, ...result } = await importPhraseLines({
    lines,
    subjectId,
  });

  sendJson(res, 200, result);
}
