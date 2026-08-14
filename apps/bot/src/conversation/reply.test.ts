import { describe, it, expect } from "vitest";
import { selectReply, formatErrorReply, START_REPLY, DECLINE_REPLY, ERROR_REPLY } from "./reply.js";
import type { Message } from "grammy/types";

function msg(extra: Partial<Message>): Message {
  return {
    message_id: 1,
    date: 0,
    chat: { id: 1, type: "private", first_name: "x" },
    ...extra,
  } as Message;
}

describe("selectReply", () => {
  describe("commands", () => {
    it("routes /start to the greeting branch", () => {
      expect(selectReply(msg({ text: "/start" }))).toEqual({ kind: "start" });
    });

    it("routes /start with bot suffix to the greeting branch", () => {
      expect(selectReply(msg({ text: "/start@post_anki_bot" }))).toEqual({ kind: "start" });
    });

    it("routes /today and /push to the today branch", () => {
      expect(selectReply(msg({ text: "/today" }))).toEqual({ kind: "today" });
      expect(selectReply(msg({ text: "/push@post_anki_bot" }))).toEqual({ kind: "today" });
    });

    it("routes /done to the done branch (AC 1)", () => {
      expect(selectReply(msg({ text: "/done" }))).toEqual({ kind: "done" });
      expect(selectReply(msg({ text: "/done@post_anki_bot" }))).toEqual({ kind: "done" });
    });

    it("routes /study <name> to the study branch with the name", () => {
      expect(selectReply(msg({ text: "/study Temporal" }))).toEqual({
        kind: "study",
        name: "Temporal",
      });
      expect(selectReply(msg({ text: "/study@post_anki_bot Kubernetes" }))).toEqual({
        kind: "study",
        name: "Kubernetes",
      });
    });

    it("routes /study with a multi-word name, trimmed", () => {
      expect(selectReply(msg({ text: "/study  Temporal Workflows  " }))).toEqual({
        kind: "study",
        name: "Temporal Workflows",
      });
    });

    it("routes bare /study with no name to the study branch with a null name", () => {
      expect(selectReply(msg({ text: "/study" }))).toEqual({ kind: "study", name: null });
      expect(selectReply(msg({ text: "/study   " }))).toEqual({ kind: "study", name: null });
    });
  });

  describe("free text", () => {
    it("routes any other text to the process branch with the text payload", () => {
      expect(selectReply(msg({ text: "what is event-driven architecture?" }))).toEqual({
        kind: "process",
        text: "what is event-driven architecture?",
      });
    });

    it("strips trailing whitespace before processing", () => {
      expect(selectReply(msg({ text: "  hi  " }))).toEqual({ kind: "process", text: "hi" });
    });
  });

  describe("continuation language", () => {
    it("routes a bare 'let's continue' to the continue branch with no tool", () => {
      expect(selectReply(msg({ text: "let's continue" }))).toEqual({
        kind: "continue",
        tool: null,
      });
    });

    it("routes 'lets continue' (no apostrophe) the same way", () => {
      expect(selectReply(msg({ text: "lets continue" }))).toEqual({
        kind: "continue",
        tool: null,
      });
    });

    it("routes 'where were we' to the continue branch with no tool", () => {
      expect(selectReply(msg({ text: "where were we" }))).toEqual({
        kind: "continue",
        tool: null,
      });
    });

    it("routes 'where were we?' (trailing punctuation) the same way", () => {
      expect(selectReply(msg({ text: "Where were we?" }))).toEqual({
        kind: "continue",
        tool: null,
      });
    });

    it("routes standalone 'continue' to the continue branch with no tool", () => {
      expect(selectReply(msg({ text: "continue" }))).toEqual({ kind: "continue", tool: null });
    });

    it("extracts a trailing tool name from 'let's continue with X'", () => {
      expect(selectReply(msg({ text: "let's continue with Kubernetes" }))).toEqual({
        kind: "continue",
        tool: "Kubernetes",
      });
    });

    it("does not treat a normal answer that happens to mention 'continue' mid-sentence as continuation language", () => {
      expect(
        selectReply(msg({ text: "let's continue with the idempotency key discussion, since keys dedupe retried writes" })),
      ).toEqual({
        kind: "process",
        text: "let's continue with the idempotency key discussion, since keys dedupe retried writes",
      });
    });

    it("routes 'let's talk about X' straight through the existing study path", () => {
      expect(selectReply(msg({ text: "let's talk about Lambda" }))).toEqual({
        kind: "study",
        name: "Lambda",
      });
    });

    it("routes 'let's discuss X' straight through the existing study path", () => {
      expect(selectReply(msg({ text: "let's discuss Temporal Workflows" }))).toEqual({
        kind: "study",
        name: "Temporal Workflows",
      });
    });
  });

  describe("non-text attachments", () => {
    it.each([
      { name: "voice", payload: { voice: { file_id: "v", duration: 1, file_unique_id: "v" } } },
      { name: "photo", payload: { photo: [{ file_id: "p", file_unique_id: "p", width: 1, height: 1 }] } },
      { name: "sticker", payload: { sticker: { file_id: "s", file_unique_id: "s", type: "regular", width: 1, height: 1, is_animated: false, is_video: false } } },
      { name: "document", payload: { document: { file_id: "d", file_unique_id: "d" } } },
      { name: "video", payload: { video: { file_id: "v", file_unique_id: "v", width: 1, height: 1, duration: 1 } } },
      { name: "audio", payload: { audio: { file_id: "a", file_unique_id: "a", duration: 1 } } },
    ])("declines $name with no LLM call", ({ payload }) => {
      expect(selectReply(msg(payload as Partial<Message>))).toEqual({ kind: "decline" });
    });

    it("declines an empty message with no text", () => {
      expect(selectReply(msg({}))).toEqual({ kind: "decline" });
    });
  });
});

describe("formatErrorReply", () => {
  it("maps any thrown value to the fixed error string", () => {
    expect(formatErrorReply(new Error("boom"))).toBe(ERROR_REPLY);
    expect(formatErrorReply("string error")).toBe(ERROR_REPLY);
    expect(formatErrorReply(undefined)).toBe(ERROR_REPLY);
    expect(formatErrorReply({ status: 503 })).toBe(ERROR_REPLY);
  });
});

describe("fixed strings", () => {
  it("greeting is short and points the owner at /today", () => {
    expect(START_REPLY.length).toBeLessThan(200);
    expect(START_REPLY).toContain("/today");
  });

  it("decline references text-only constraint", () => {
    expect(DECLINE_REPLY.toLowerCase()).toContain("text");
  });

  it("error reply is non-guilt-inducing and short", () => {
    expect(ERROR_REPLY.length).toBeLessThan(120);
    expect(ERROR_REPLY.toLowerCase()).not.toContain("sorry");
  });
});
