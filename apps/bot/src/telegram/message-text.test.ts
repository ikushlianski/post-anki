import { describe, expect, it } from "vitest";
import type { Message } from "grammy/types";
import { messageText } from "./message-text.js";
import { selectReply } from "../conversation/reply.js";

const base = { message_id: 1, date: 0, chat: { id: 1, type: "private", first_name: "x" } };

function msg(extra: Record<string, unknown>): Message {
  return { ...base, ...extra } as Message;
}

describe("messageText", () => {
  it("should use the caption of a photo as the note to process", () => {
    expect(messageText(msg({ photo: [], caption: "  read this later " }))).toBe("read this later");
  });

  it("should use the caption of a forwarded message", () => {
    expect(messageText(msg({ forward_origin: { type: "hidden_user" }, caption: "great post" }))).toBe("great post");
  });

  it("should prefer typed text over a caption", () => {
    expect(messageText(msg({ text: "hello", caption: "ignored" }))).toBe("hello");
  });

  it("should give an empty note for a photo without a caption", () => {
    expect(messageText(msg({ photo: [] }))).toBe("");
  });

  it("should not treat a voice note caption as the answer", () => {
    expect(messageText(msg({ voice: { file_id: "v", duration: 1 }, caption: "x" }))).toBe("");
  });
});

describe("selectReply with captions", () => {
  it("should process a captioned photo instead of declining it", () => {
    expect(selectReply(msg({ photo: [], caption: "interesting article" }))).toEqual({
      kind: "process",
      text: "interesting article",
    });
  });

  it("should still decline a photo with no caption", () => {
    expect(selectReply(msg({ photo: [] }))).toEqual({ kind: "decline" });
  });
});
