import { describe, expect, it } from "vitest";
import pino from "pino";

process.env.DATABASE_URL ??= "postgres://x/y";
process.env.OPENROUTER_API_KEY ??= "key";

const { LOG_REDACT_PATHS } = await import("./log.js");

function logged(fields: Record<string, unknown>): string {
  const lines: string[] = [];
  const logger = pino({ redact: LOG_REDACT_PATHS }, { write: (line: string) => void lines.push(line) });

  logger.info(fields, "x");

  return lines.join("");
}

describe("log redaction", () => {
  it("should never write a token field", () => {
    expect(logged({ token: "secret_abc" })).not.toContain("secret_abc");
    expect(logged({ body: { token: "secret_abc" } })).not.toContain("secret_abc");
  });

  it("should never write the authorization header", () => {
    expect(logged({ req: { headers: { authorization: "Bearer secret_abc" } } })).not.toContain("secret_abc");
  });
});
