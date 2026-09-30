import type { AddressInfo } from "node:net";
import type http from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { NextQuestionVariantRow } from "./knowledge-bit-question-variant.repo.js";

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/db";
process.env.OPENROUTER_API_KEY ??= "test-key";
process.env.API_SHARED_SECRET = "the-shared-secret";

const state = vi.hoisted(() => ({
  rows: [] as NextQuestionVariantRow[],
}));

vi.mock("./knowledge-bit-question-variant.repo.js", async () => {
  const actual = await vi.importActual<typeof import("./knowledge-bit-question-variant.repo.js")>(
    "./knowledge-bit-question-variant.repo.js",
  );

  return {
    ...actual,
    listNextQuestionVariantsToAnswer: vi.fn(async () => state.rows),
  };
});

const { createApiServer } = await import("../api-server.js");

const SHARED_SECRET = process.env.API_SHARED_SECRET!;

let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  server = createApiServer();

  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });

  const address = server.address() as AddressInfo;

  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

afterEach(() => {
  state.rows = [];
  vi.clearAllMocks();
});

describe("GET /knowledge-bits/question-variants/next", () => {
  it("includes the seeded bit's non-null background in the response JSON", async () => {
    state.rows = [
      {
        variantId: "kbqv_1",
        kind: "wh_question",
        prompt: "What handshake does TCP use?",
        knowledgeBitId: "kb_1",
        bitBody: "TCP uses a three-way handshake.",
        background: "Covered in the networking module before this bit.",
      },
    ];

    const response = await fetch(`${baseUrl}/knowledge-bits/question-variants/next`, {
      headers: { authorization: `Bearer ${SHARED_SECRET}` },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual([
      {
        variantId: "kbqv_1",
        kind: "wh_question",
        prompt: "What handshake does TCP use?",
        knowledgeBitId: "kb_1",
        bitBody: "TCP uses a three-way handshake.",
        background: "Covered in the networking module before this bit.",
      },
    ]);
  });
});
