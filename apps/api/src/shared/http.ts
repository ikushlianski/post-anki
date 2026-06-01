import type http from "node:http";
import { z } from "zod";

export function sendJson(
  res: http.ServerResponse,
  status: number,
  body: unknown,
): void {
  res.writeHead(status, { "content-type": "application/json" });
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

export async function readJsonBody<T>(
  req: http.IncomingMessage,
  schema: z.ZodType<T>,
): Promise<{ ok: true; data: T } | { ok: false; issues: string }> {
  const raw = await readRaw(req);

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
    let raw = "";

    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}
