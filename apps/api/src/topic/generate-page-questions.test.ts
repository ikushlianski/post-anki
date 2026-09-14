import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveCourseGroundingSources = vi.fn();

vi.mock("../lecture/course-source-grounding.js", () => ({
  resolveCourseGroundingSources: (topicId: string) => resolveCourseGroundingSources(topicId),
}));

const { gatherPageGroundedQuestionContext } = await import("./generate-page-questions.js");

describe("gatherPageGroundedQuestionContext citation safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("drops an unsafe approved-source URL before it becomes a citation", async () => {
    resolveCourseGroundingSources.mockResolvedValue([
      { title: "Docs", url: "https://example.com/docs", text: "real content" },
      {
        title: "Blocked",
        url: "javascript:alert(1)",
        text: "[could not fetch javascript:alert(1): only http and https links can be fetched]",
      },
    ]);

    const result = await gatherPageGroundedQuestionContext("topic-1");

    expect(result?.citations).toEqual(["https://example.com/docs"]);
  });

  it("keeps a normal https source URL intact", async () => {
    resolveCourseGroundingSources.mockResolvedValue([
      { title: "Docs", url: "https://example.com/docs", text: "real content" },
    ]);

    const result = await gatherPageGroundedQuestionContext("topic-1");

    expect(result?.citations).toEqual(["https://example.com/docs"]);
  });
});
