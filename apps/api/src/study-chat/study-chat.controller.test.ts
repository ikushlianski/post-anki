import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeReq, fakeRes } from "../shared/fake-http.test-mocks.js";

const askStudyChat = vi.fn();

vi.mock("./study-chat.service.js", () => ({
  askStudyChat: (...args: unknown[]) => askStudyChat(...args),
}));

const { handleAskStudyChat } = await import("./study-chat.controller.js");

describe("ask study chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should answer 400 and ask nothing when the message is empty", async () => {
    const res = fakeRes();

    await handleAskStudyChat(fakeReq(JSON.stringify({ message: "" })), res, "t1");

    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toBe("invalid_input");
    expect(askStudyChat).not.toHaveBeenCalled();
  });

  it("should answer 400 when the body is not valid JSON", async () => {
    const res = fakeRes();

    await handleAskStudyChat(fakeReq("{nope"), res, "t1");

    expect(res.status).toBe(400);
    expect(askStudyChat).not.toHaveBeenCalled();
  });

  it("should answer 404 when the topic does not exist", async () => {
    askStudyChat.mockResolvedValue({ error: "not_found" });
    const res = fakeRes();

    await handleAskStudyChat(fakeReq(JSON.stringify({ message: "Why?" })), res, "gone");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "not_found" });
  });

  it("should use the topic from the URL and answer 200 with the reply", async () => {
    askStudyChat.mockResolvedValue({ reply: "Because." });
    const res = fakeRes();

    await handleAskStudyChat(fakeReq(JSON.stringify({ message: "Why?", topicId: "spoofed" })), res, "t1");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ reply: "Because." });
    expect(askStudyChat).toHaveBeenCalledWith({ message: "Why?", topicId: "t1" });
  });
});
