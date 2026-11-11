import { describe, expect, it } from "vitest";
import { askGlobalCardChatInput } from "./global-card-chat.js";
import { askSubjectChatInput } from "./subject-chat.js";
import { askStudyChatInput } from "./study-chat.js";
import { askKnowledgeBitChatInput } from "./knowledge-bit-chat.js";
import { sendChatQueueMessageInput } from "./knowledge-bit-chat-queue.js";

const ALLOWED = "openrouter/google/gemma-4-31b-it";

describe("chat requests carrying a model id", () => {
  it.each([
    ["global card chat", askGlobalCardChatInput, { message: "hi" }],
    ["subject chat", askSubjectChatInput, { message: "hi", subjectId: "s1" }],
    ["study chat", askStudyChatInput, { message: "hi", topicId: "t1" }],
    ["knowledge bit chat", askKnowledgeBitChatInput, { message: "hi" }],
    ["chat queue", sendChatQueueMessageInput, { message: "hi", clientMessageId: "c1" }],
  ])("should accept an admin-listed model and reject any other in %s", (_name, schema, base) => {
    expect(schema.safeParse({ ...base, modelId: ALLOWED }).success).toBe(true);
    expect(schema.safeParse({ ...base, modelId: "openrouter/evil/model" }).success).toBe(false);
    expect(schema.safeParse(base).success).toBe(true);
  });
});
