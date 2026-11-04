import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeReq, fakeRes } from "../shared/fake-http.test-mocks.js";

const askQaChat = vi.fn();

vi.mock("./qa-chat.service.js", () => ({
  askQaChat: (...args: unknown[]) => askQaChat(...args),
}));

const { handleAskQaChat } = await import("./qa-chat.controller.js");

describe("ask Q&A chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should answer 400 and ask nothing when the message is empty", async () => {
    const res = fakeRes();

    await handleAskQaChat(fakeReq(JSON.stringify({ message: "" })), res);

    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe("invalid_input");
    expect(askQaChat).not.toHaveBeenCalled();
  });

  it("should answer 400 when the body is not valid JSON", async () => {
    const res = fakeRes();

    await handleAskQaChat(fakeReq("{nope"), res);

    expect(res.status).toBe(400);
    expect(askQaChat).not.toHaveBeenCalled();
  });

  it("should answer 404 when the referenced topic does not exist", async () => {
    askQaChat.mockResolvedValue({ error: "not_found" });
    const res = fakeRes();

    await handleAskQaChat(fakeReq(JSON.stringify({ message: "Why?", topicId: "gone" })), res);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "not_found" });
  });

  it("should answer 200 with the reply for a valid question", async () => {
    askQaChat.mockResolvedValue({ reply: "Because." });
    const res = fakeRes();

    await handleAskQaChat(fakeReq(JSON.stringify({ message: "Why?" })), res);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ reply: "Because." });
    expect(askQaChat).toHaveBeenCalledWith({ message: "Why?" });
  });
});
