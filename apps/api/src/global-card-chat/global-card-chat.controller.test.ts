import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeReq, fakeRes } from "../shared/fake-http.test-mocks.js";

const askGlobalCardChat = vi.fn();

vi.mock("./global-card-chat.service.js", () => ({
  askGlobalCardChat: (...args: unknown[]) => askGlobalCardChat(...args),
}));

const { handleAskGlobalCardChat } = await import("./global-card-chat.controller.js");

describe("ask global card chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should answer 400 and not call the tutor when the message is empty", async () => {
    const res = fakeRes();

    await handleAskGlobalCardChat(fakeReq(JSON.stringify({ message: "" })), res);

    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe("invalid_input");
    expect(askGlobalCardChat).not.toHaveBeenCalled();
  });

  it("should answer 400 when the message is missing", async () => {
    const res = fakeRes();

    await handleAskGlobalCardChat(fakeReq("{}"), res);

    expect(res.status).toBe(400);
    expect(askGlobalCardChat).not.toHaveBeenCalled();
  });

  it("should answer 400 when the body is not valid JSON", async () => {
    const res = fakeRes();

    await handleAskGlobalCardChat(fakeReq("{nope"), res);

    expect(res.status).toBe(400);
    expect(askGlobalCardChat).not.toHaveBeenCalled();
  });

  it("should answer 200 with the tutor reply for a valid question", async () => {
    const result = { reply: "Because X.", matchedCards: [] };

    askGlobalCardChat.mockResolvedValue(result);
    const res = fakeRes();

    await handleAskGlobalCardChat(fakeReq(JSON.stringify({ message: "Why X?", allowGeneralKnowledge: true })), res);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(result);
    expect(askGlobalCardChat).toHaveBeenCalledWith({ message: "Why X?", allowGeneralKnowledge: true });
  });
});
