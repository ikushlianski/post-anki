import type http from "node:http";
import { knowledgeBitExportQuerySchema } from "@post-anki/shared";
import { sendJson } from "../shared/http.js";
import { csvHeaderLine, csvLine } from "./knowledge-bit-export.csv.js";
import { streamApprovedCards } from "./knowledge-bit-export.repo.js";

async function write(res: http.ServerResponse, chunk: string): Promise<boolean> {
  if (res.destroyed) {
    return false;
  }

  if (res.write(chunk)) {
    return true;
  }

  return new Promise<boolean>((resolve) => {
    const settle = (ok: boolean) => () => {
      res.off("drain", onDrain);
      res.off("close", onClose);
      res.off("error", onClose);
      resolve(ok);
    };
    const onDrain = settle(true);
    const onClose = settle(false);

    res.once("drain", onDrain);
    res.once("close", onClose);
    res.once("error", onClose);
  });
}

// GET /knowledge-bits/export?format=json|csv
export async function handleExportKnowledgeBits(
  res: http.ServerResponse,
  search: string,
): Promise<void> {
  const parsed = knowledgeBitExportQuerySchema.safeParse(
    Object.fromEntries(new URLSearchParams(search)),
  );

  if (!parsed.success) {
    sendJson(res, 400, { error: "invalid_input", message: parsed.error.issues });
    return;
  }

  const now = new Date();
  const { format } = parsed.data;
  const date = now.toISOString().slice(0, 10);

  res.writeHead(200, {
    "content-type": format === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8",
    "content-disposition": `attachment; filename="post-anki-cards-${date}.${format}"`,
    "cache-control": "no-store",
  });

  let first = true;

  try {
    const opening = format === "csv" ? csvHeaderLine() : `{"exportedAt":"${now.toISOString()}","cards":[`;

    if (!(await write(res, opening))) {
      return;
    }

    for await (const batch of streamApprovedCards(now)) {
      for (const card of batch) {
        const line = format === "csv" ? csvLine(card) : (first ? "" : ",") + JSON.stringify(card);

        first = false;

        if (!(await write(res, line))) {
          return;
        }
      }
    }
  } catch (err) {
    res.destroy();
    throw err;
  }

  res.end(format === "csv" ? undefined : "]}");
}
