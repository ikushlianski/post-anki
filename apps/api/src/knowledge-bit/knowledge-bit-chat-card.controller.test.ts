import { Readable } from "node:stream";
import type http from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MANUAL_ITEM_BACK_MAX_CHARS, MANUAL_ITEM_EXAMPLE_MAX_CHARS, MANUAL_ITEM_FRONT_MAX_CHARS } from "@post-anki/shared";

vi.mock("../shared/log.js", () => ({ log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock("./knowledge-bit-approval-embedding.orchestrator.js", () => ({ embedApprovedKnowledgeBits: vi.fn() }));
vi.mock("./knowledge-bit-chat-card.repo.js", () => ({ insertCardFromChatMessage: vi.fn() }));
vi.mock("./knowledge-bit-chat-queue.repo.js", () => ({}));
vi.mock("./knowledge-bit-chat-queue.service.js", () => ({}));
vi.mock("./knowledge-bit-chat-queue-messages.repo.js", () => ({}));
vi.mock("./knowledge-bit-chat-queue-search.repo.js", () => ({}));

const { embedApprovedKnowledgeBits } = await import("./knowledge-bit-approval-embedding.orchestrator.js");
const { insertCardFromChatMessage } = await import("./knowledge-bit-chat-card.repo.js");
const { handleCreateCardFromChatMessage } = await import("./knowledge-bit-chat-queue.controller.js");

function fakeReq(body: unknown): http.IncomingMessage {
  return Readable.from([JSON.stringify(body)]) as unknown as http.IncomingMessage;
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

describe("handleCreateCardFromChatMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create a pending card from an edited tutor reply without calling a model", async () => {
    vi.mocked(insertCardFromChatMessage).mockResolvedValue({ ok: true, id: "kb_new" });

    const res = fakeRes();

    await handleCreateCardFromChatMessage(fakeReq({ front: " Why? ", back: "Because" }), res, "kb_1", "2");

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true, id: "kb_new" });
    expect(insertCardFromChatMessage).toHaveBeenCalledWith("kb_1", 2, { front: "Why?", back: "Because" });
  });

  it("should embed the new card when it is approved straight from the chat", async () => {
    vi.mocked(insertCardFromChatMessage).mockResolvedValue({ ok: true, id: "kb_new" });

    const res = fakeRes();

    await handleCreateCardFromChatMessage(
      fakeReq({ front: "Why?", back: "Because", example: " e.g. ", approve: true }),
      res,
      "kb_1",
      "2",
    );

    expect(res.status).toBe(201);
    expect(insertCardFromChatMessage).toHaveBeenCalledWith("kb_1", 2, {
      front: "Why?",
      back: "Because",
      example: "e.g.",
      approve: true,
    });
    expect(embedApprovedKnowledgeBits).toHaveBeenCalledWith(["kb_new"]);
  });

  it("should still answer created when embedding the approved card fails", async () => {
    vi.mocked(insertCardFromChatMessage).mockResolvedValue({ ok: true, id: "kb_new" });
    vi.mocked(embedApprovedKnowledgeBits).mockRejectedValueOnce(new Error("embed down"));

    const res = fakeRes();

    await handleCreateCardFromChatMessage(fakeReq({ front: "Q", back: "A", approve: true }), res, "kb_1", "2");

    expect(res.status).toBe(201);
  });

  it("should not embed anything when the card stays pending", async () => {
    vi.mocked(insertCardFromChatMessage).mockResolvedValue({ ok: true, id: "kb_new" });

    await handleCreateCardFromChatMessage(fakeReq({ front: "Q", back: "A", approve: false }), fakeRes(), "kb_1", "2");

    expect(embedApprovedKnowledgeBits).not.toHaveBeenCalled();
  });

  it("should answer 400 when approve is not a boolean or the example is too long", async () => {
    const badApprove = fakeRes();
    const longExample = fakeRes();

    await handleCreateCardFromChatMessage(fakeReq({ front: "Q", back: "A", approve: "yes" }), badApprove, "kb_1", "2");
    await handleCreateCardFromChatMessage(
      fakeReq({ front: "Q", back: "A", example: "x".repeat(MANUAL_ITEM_EXAMPLE_MAX_CHARS + 1) }),
      longExample,
      "kb_1",
      "2",
    );

    expect(badApprove.status).toBe(400);
    expect(longExample.status).toBe(400);
    expect(insertCardFromChatMessage).not.toHaveBeenCalled();
  });

  it("should reject a front or back longer than the manual card limits", async () => {
    const tooLongFront = fakeRes();
    const tooLongBack = fakeRes();

    await handleCreateCardFromChatMessage(
      fakeReq({ front: "x".repeat(MANUAL_ITEM_FRONT_MAX_CHARS + 1), back: "a" }),
      tooLongFront,
      "kb_1",
      "2",
    );
    await handleCreateCardFromChatMessage(
      fakeReq({ front: "q", back: "x".repeat(MANUAL_ITEM_BACK_MAX_CHARS + 1) }),
      tooLongBack,
      "kb_1",
      "2",
    );

    expect(tooLongFront.status).toBe(400);
    expect(tooLongBack.status).toBe(400);
    expect(insertCardFromChatMessage).not.toHaveBeenCalled();
  });

  it.each([
    ["not_found", 404],
    ["not_in_chat", 409],
    ["not_assistant_message", 422],
  ] as const)("should answer %s with status %i", async (error, status) => {
    vi.mocked(insertCardFromChatMessage).mockResolvedValue({ ok: false, error });

    const res = fakeRes();

    await handleCreateCardFromChatMessage(fakeReq({ front: "q", back: "a" }), res, "kb_1", "1");

    expect(res.status).toBe(status);
  });
});
