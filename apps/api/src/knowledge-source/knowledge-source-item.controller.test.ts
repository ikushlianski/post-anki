import { Readable } from "node:stream";
import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BASIC_CARD_BACK_MAX_CHARS, BASIC_CARD_FRONT_MAX_CHARS } from "../knowledge-bit/knowledge-bit-basic-card-validation.js";
import { SOURCE_ITEM_QUOTE_MAX_CHARS } from "../knowledge-bit/knowledge-bit-source-item-validation.js";
import { MANUAL_ITEM_BACK_MAX_CHARS, MANUAL_ITEM_EXAMPLE_MAX_CHARS, MANUAL_ITEM_FRONT_MAX_CHARS } from "@post-anki/shared";

const insertManualKnowledgeItem = vi.fn();

vi.mock("../knowledge-bit/knowledge-bit-manual-item.repo.js", () => ({
  insertManualKnowledgeItem: (...args: unknown[]) => insertManualKnowledgeItem(...args),
}));

const { handleCreateKnowledgeSourceItem } = await import("./knowledge-source-item.controller.js");

function fakeReq(body: unknown): http.IncomingMessage {
  return Readable.from(body === undefined ? [] : [JSON.stringify(body)]) as unknown as http.IncomingMessage;
}

function fakeRes() {
  const res = {
    status: null as number | null,
    body: undefined as unknown,
    writeHead(status: number) {
      res.status = status;
      return res;
    },
    end(payload?: string) {
      res.body = payload ? JSON.parse(payload) : undefined;
    },
  };

  return res as unknown as http.ServerResponse & { status: number | null; body: unknown };
}

const createdItem = {
  id: "kb_1",
  body: "Q\nA",
  background: "ex",
  variants: [{ id: "kbqv_1", kind: "basic", prompt: "Q", answer: "A" }],
  feedback: null,
};

describe("handleCreateKnowledgeSourceItem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should reply 201 with the pending item shape for a valid front and back", async () => {
    insertManualKnowledgeItem.mockResolvedValue({ ok: true, item: createdItem });

    const res = fakeRes();

    await handleCreateKnowledgeSourceItem(fakeReq({ front: " Q ", back: "A", example: "ex" }), res, "ks_1");

    expect(res.status).toBe(201);
    expect(res.body).toEqual(createdItem);
    expect(insertManualKnowledgeItem).toHaveBeenCalledWith("ks_1", { front: "Q", back: "A", example: "ex", aiGenerated: false });
  });

  it("should accept example null and create the item without an example", async () => {
    insertManualKnowledgeItem.mockResolvedValue({ ok: true, item: { ...createdItem, background: null } });

    const res = fakeRes();

    await handleCreateKnowledgeSourceItem(fakeReq({ front: "Q", back: "A", example: null }), res, "ks_1");

    expect(res.status).toBe(201);
    expect(insertManualKnowledgeItem).toHaveBeenCalledWith("ks_1", { front: "Q", back: "A", example: undefined, aiGenerated: false });
  });

  it.each([
    ["whitespace-only front", { front: "   ", back: "A" }],
    ["whitespace-only back", { front: "Q", back: " \n " }],
    ["missing back", { front: "Q" }],
    ["overlong front", { front: "f".repeat(MANUAL_ITEM_FRONT_MAX_CHARS + 1), back: "A" }],
    ["overlong back", { front: "Q", back: "b".repeat(MANUAL_ITEM_BACK_MAX_CHARS + 1) }],
  ])("should reply 400 invalid_input for a %s and write nothing", async (_label, body) => {
    const res = fakeRes();

    await handleCreateKnowledgeSourceItem(fakeReq(body), res, "ks_1");

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: "invalid_input" });
    expect(insertManualKnowledgeItem).not.toHaveBeenCalled();
  });

  it.each([
    ["not_found", 404],
    ["already_running", 409],
    ["entry_processed", 409],
  ])("should reply %s as %i and leave no item behind", async (error, status) => {
    insertManualKnowledgeItem.mockResolvedValue({ ok: false, error });

    const res = fakeRes();

    await handleCreateKnowledgeSourceItem(fakeReq({ front: "Q", back: "A" }), res, "ks_1");

    expect(res.status).toBe(status);
    expect(res.body).toEqual({ error });
  });

  it("should keep the manual caps equal to the extraction caps for the same fields", () => {
    expect(MANUAL_ITEM_FRONT_MAX_CHARS).toBe(BASIC_CARD_FRONT_MAX_CHARS);
    expect(MANUAL_ITEM_BACK_MAX_CHARS).toBe(BASIC_CARD_BACK_MAX_CHARS);
    expect(MANUAL_ITEM_EXAMPLE_MAX_CHARS).toBe(SOURCE_ITEM_QUOTE_MAX_CHARS);
  });
});
