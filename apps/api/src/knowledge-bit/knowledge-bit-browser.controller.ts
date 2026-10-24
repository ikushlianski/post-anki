import type http from "node:http";
import { knowledgeBitBrowserQuerySchema } from "@post-anki/shared";
import { sendJson } from "../shared/http.js";
import {
  countKnowledgeBitBrowserSubjects,
  listKnowledgeBitBrowser,
} from "./knowledge-bit-browser.repo.js";

// GET /knowledge-bits/browser
export async function handleListKnowledgeBitBrowser(
  res: http.ServerResponse,
  search: string,
): Promise<void> {
  const parsed = knowledgeBitBrowserQuerySchema.safeParse(
    Object.fromEntries(new URLSearchParams(search)),
  );

  if (!parsed.success) {
    sendJson(res, 400, { error: "invalid_input", message: parsed.error.issues });
    return;
  }

  sendJson(res, 200, await listKnowledgeBitBrowser(parsed.data));
}

// GET /knowledge-bits/browser/subjects
export async function handleCountKnowledgeBitBrowserSubjects(
  res: http.ServerResponse,
): Promise<void> {
  sendJson(res, 200, await countKnowledgeBitBrowserSubjects());
}
