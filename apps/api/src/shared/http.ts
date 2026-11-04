import type http from "node:http";
import { z } from "zod";

export const MAX_BODY_BYTES = 1_000_000;

export class BodyTooLargeError extends Error {
  constructor() {
    super("request body too large");
    this.name = "BodyTooLargeError";
  }
}

export function sendJson(
  res: http.ServerResponse,
  status: number,
  body: unknown,
): void {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-content-type-options": "nosniff",
  };

  if (res.getHeader?.("cache-control") === undefined) {
    headers["cache-control"] = "no-store";
  }

  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

export function sendError(
  res: http.ServerResponse,
  status: number,
  error: string,
  message?: string,
): void {
  sendJson(res, status, message ? { error, message } : { error });
}

export function sendBadGateway(res: http.ServerResponse, error: string): void {
  sendError(res, 502, error, "An upstream service failed. Try again shortly.");
}

export function sendInvalidQuery(res: http.ServerResponse, error: z.ZodError): void {
  const issues = error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");

  sendJson(res, 400, { error: "invalid_input", message: issues });
}

export async function readJsonBody<T>(
  req: http.IncomingMessage,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
): Promise<{ ok: true; data: T } | { ok: false; issues: string }> {
  let raw: string;

  try {
    raw = await readRaw(req);
  } catch (err) {
    if (err instanceof Error && err.message === "body_too_large") {
      throw new BodyTooLargeError();
    }

    return { ok: false, issues: "could not read request body" };
  }

  let parsed: unknown;

  try {
    parsed = raw.length > 0 ? JSON.parse(raw) : {};
  } catch {
    return { ok: false, issues: "body is not valid JSON" };
  }

  const result = schema.safeParse(parsed);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");

    return { ok: false, issues };
  }

  return { ok: true, data: result.data };
}

function readRaw(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    let aborted = false;

    req.on("data", (chunk) => {
      if (aborted) {
        return;
      }

      bytes += chunk.length;

      if (bytes > MAX_BODY_BYTES) {
        aborted = true;
        reject(new Error("body_too_large"));
        return;
      }

      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on("end", () => {
      if (!aborted) {
        resolve(Buffer.concat(chunks).toString("utf8"));
      }
    });
    req.on("error", reject);
  });
}
