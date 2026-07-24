import { describe, it, expect, vi, beforeEach } from "vitest";
import { startStudy, STUDY_USAGE_REPLY, formatStudyStarted } from "./study-flow.js";
import { sendMessage } from "../telegram/bot.js";
import { createStudyCurriculum, getOrCreateQuickStudiesSubject } from "../api/client.js";

vi.mock("../telegram/bot.js", () => ({
  sendMessage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../api/client.js", () => ({
  getOrCreateQuickStudiesSubject: vi.fn(),
  createStudyCurriculum: vi.fn(),
}));

const CHAT_ID = 42;

describe("startStudy", () => {
  beforeEach(() => {
    vi.mocked(sendMessage).mockClear();
    vi.mocked(getOrCreateQuickStudiesSubject).mockReset();
    vi.mocked(createStudyCurriculum).mockReset();
  });

  describe("when no technology name is given", () => {
    it("replies with a usage hint and creates nothing", async () => {
      await startStudy(CHAT_ID, null);

      expect(sendMessage).toHaveBeenCalledWith(CHAT_ID, STUDY_USAGE_REPLY);
      expect(getOrCreateQuickStudiesSubject).not.toHaveBeenCalled();
      expect(createStudyCurriculum).not.toHaveBeenCalled();
    });
  });

  describe("when a technology name is given", () => {
    it("finds or creates the Quick Studies subject and starts a research curriculum", async () => {
      vi.mocked(getOrCreateQuickStudiesSubject).mockResolvedValue({
        id: "sub1",
        name: "Quick Studies",
        requireSources: false,
        kind: "architecture-mentor",
      });
      vi.mocked(createStudyCurriculum).mockResolvedValue(undefined);

      await startStudy(CHAT_ID, "Temporal");

      expect(getOrCreateQuickStudiesSubject).toHaveBeenCalledOnce();
      expect(createStudyCurriculum).toHaveBeenCalledWith("sub1", "Temporal");
      expect(sendMessage).toHaveBeenCalledWith(CHAT_ID, formatStudyStarted("Temporal"));
    });
  });
});

describe("formatStudyStarted", () => {
  it("tells the user to finish reviewing and picking on the web app", () => {
    const reply = formatStudyStarted("Temporal");

    expect(reply).toContain("Temporal");
    expect(reply).toContain("web app");
  });
});
