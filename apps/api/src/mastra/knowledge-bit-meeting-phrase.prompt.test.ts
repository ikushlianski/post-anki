import { describe, expect, it } from "vitest";
import { buildMeetingPhrasePrompt, MEETING_PHRASE_INSTRUCTIONS } from "./knowledge-bit-meeting-phrase.prompt.js";

describe("buildMeetingPhrasePrompt", () => {
  it("should ask the model to verify spelling and translation only for phrases the learner marked unsure", () => {
    const unsure = buildMeetingPhrasePrompt("wrap it up", "завершить", true);
    const sure = buildMeetingPhrasePrompt("wrap it up", "завершить", false);

    expect(unsure).toContain("verify its spelling and the hint's translation");
    expect(sure).not.toContain("unsure");
    expect(sure).toBe("<phrase>\nwrap it up\n</phrase>\n<hint>\nзавершить\n</hint>");
  });

  it("should instruct the model to correct unsure phrases instead of copying them", () => {
    expect(MEETING_PHRASE_INSTRUCTIONS).toContain("Never copy an unsure phrase or its hint blindly");
  });
});
