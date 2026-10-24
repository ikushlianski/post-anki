import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_CHAT_TRANSCRIPT_MESSAGES } from "@post-anki/shared";

const generate = vi.fn();

vi.mock("../mastra/mastra.js", () => ({
  AGENT_KEYS: { studyChat: "studyChat", languageChat: "languageChat" },
  getMastra: () => ({ getAgent: () => ({ generate }) }),
}));

vi.mock("../mastra/generate-with-retry.js", () => ({
  generateWithRetry: (_op: unknown, _curriculumId: unknown, _agentKey: unknown, fn: () => unknown) =>
    fn(),
}));

const getTopicRow = vi.fn();

vi.mock("../topic/topic-progress.repo.js", () => ({
  getTopicRow: (id: string) => getTopicRow(id),
}));

const getCurriculumContextForTopic = vi.fn();
const getCurriculumPromptContext = vi.fn();
const getLearningMapSnapshots = vi.fn();

vi.mock("../curriculum/curriculum.repo.js", () => ({
  getCurriculumContextForTopic: (id: string) => getCurriculumContextForTopic(id),
  getCurriculumPromptContext: (id: string) => getCurriculumPromptContext(id),
  getLearningMapSnapshots: () => getLearningMapSnapshots(),
}));

vi.mock("../shared/log.js", () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const { askStudyChat } = await import("./study-chat.service.js");

function longTranscript(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
    text: `turn-${i}`,
  }));
}

describe("askStudyChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTopicRow.mockResolvedValue({ id: "t1", title: "TLS termination", summary: null });
    getCurriculumContextForTopic.mockResolvedValue({ curriculumId: "c1" });
    getCurriculumPromptContext.mockResolvedValue({
      curriculumName: "Networking",
      subjectName: "Architecture",
      subjectKind: "architecture-mentor",
    });
    getLearningMapSnapshots.mockResolvedValue([]);
    generate.mockResolvedValue({ text: "Because the edge terminates it." });
  });

  it("should send only the newest turns plus the current message when the transcript is longer than the limit", async () => {
    const total = MAX_CHAT_TRANSCRIPT_MESSAGES + 10;

    await askStudyChat({
      topicId: "t1",
      message: "current question",
      transcript: longTranscript(total),
    });

    const prompt = generate.mock.calls[0]![0] as string;

    expect(prompt).not.toContain("turn-0\n");
    expect(prompt).not.toMatch(/turn-9(?!\d)/);
    expect(prompt).toContain(`turn-${total - MAX_CHAT_TRANSCRIPT_MESSAGES}`);
    expect(prompt).toContain(`turn-${total - 1}`);
    expect(prompt).toContain("current question");
  });

  it("should keep a short transcript whole", async () => {
    await askStudyChat({ topicId: "t1", message: "current question", transcript: longTranscript(3) });

    const prompt = generate.mock.calls[0]![0] as string;

    expect(prompt).toContain("turn-0");
    expect(prompt).toContain("turn-2");
  });
});
