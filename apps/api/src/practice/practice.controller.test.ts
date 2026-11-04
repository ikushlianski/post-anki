import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeReq, fakeRes } from "../shared/fake-http.test-mocks.js";

const getSubject = vi.fn();
const getOrCreatePracticeSettings = vi.fn();
const updatePracticeSettings = vi.fn();
const generatePhraseBatch = vi.fn();
const gradeAttempts = vi.fn();
const getPhraseBankSummary = vi.fn();
const gradeAndStoreWritingCheck = vi.fn();
const getWritingChecksForSubject = vi.fn();

vi.mock("../subject/subject.repo.js", () => ({
  getSubject: (...args: unknown[]) => getSubject(...args),
}));

vi.mock("./practice.repo.js", () => ({
  getOrCreatePracticeSettings: (...args: unknown[]) => getOrCreatePracticeSettings(...args),
  updatePracticeSettings: (...args: unknown[]) => updatePracticeSettings(...args),
}));

vi.mock("./generate-phrase-batch.orchestrator.js", () => ({
  generatePhraseBatch: (...args: unknown[]) => generatePhraseBatch(...args),
}));

vi.mock("./grade-attempts.orchestrator.js", () => ({
  gradeAttempts: (...args: unknown[]) => gradeAttempts(...args),
}));

vi.mock("./phrase-bank.repo.js", () => ({
  getPhraseBankSummary: (...args: unknown[]) => getPhraseBankSummary(...args),
}));

vi.mock("./writing-check.orchestrator.js", () => ({
  gradeAndStoreWritingCheck: (...args: unknown[]) => gradeAndStoreWritingCheck(...args),
}));

vi.mock("./writing-check.repo.js", () => ({
  getWritingChecksForSubject: (...args: unknown[]) => getWritingChecksForSubject(...args),
}));

const {
  handleCreateAttempts,
  handleCreatePhraseBatch,
  handleCreateWritingCheck,
  handleGetPhraseBank,
  handleGetPracticeSettings,
  handleListWritingChecks,
  handleUpdatePracticeSettings,
} = await import("./practice.controller.js");

const settings = { level: "B1_B2", pack: "General" };

const routes = [
  { name: "get settings", call: (res: ReturnType<typeof fakeRes>) => handleGetPracticeSettings(res, "s1") },
  { name: "update settings", call: (res: ReturnType<typeof fakeRes>) => handleUpdatePracticeSettings(fakeReq("{}"), res, "s1") },
  { name: "create phrase batch", call: (res: ReturnType<typeof fakeRes>) => handleCreatePhraseBatch(res, "s1") },
  {
    name: "create attempts",
    call: (res: ReturnType<typeof fakeRes>) =>
      handleCreateAttempts(fakeReq(JSON.stringify({ answers: [{ phraseId: "p1", userAnswer: "a" }] })), res, "s1"),
  },
  { name: "get phrase bank", call: (res: ReturnType<typeof fakeRes>) => handleGetPhraseBank(res, "s1") },
  {
    name: "create writing check",
    call: (res: ReturnType<typeof fakeRes>) => handleCreateWritingCheck(fakeReq(JSON.stringify({ text: "hi" })), res, "s1"),
  },
  { name: "list writing checks", call: (res: ReturnType<typeof fakeRes>) => handleListWritingChecks(res, "s1") },
];

describe("practice routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getOrCreatePracticeSettings.mockResolvedValue(settings);
  });

  describe.each(routes)("$name", ({ call }) => {
    it("should answer 400 not_a_language_practice_subject when the subject does not exist", async () => {
      getSubject.mockResolvedValue(null);
      const res = fakeRes();

      await call(res);

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "not_a_language_practice_subject" });
      expect(getOrCreatePracticeSettings).not.toHaveBeenCalled();
    });

    it("should answer 400 not_a_language_practice_subject when the subject is another kind", async () => {
      getSubject.mockResolvedValue({ id: "s1", kind: "knowledge" });
      const res = fakeRes();

      await call(res);

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "not_a_language_practice_subject" });
    });
  });

  describe("for a language practice subject", () => {
    beforeEach(() => {
      getSubject.mockResolvedValue({ id: "s1", kind: "language-practice" });
    });

    it("should return the practice settings", async () => {
      const res = fakeRes();

      await handleGetPracticeSettings(res, "s1");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(settings);
    });

    it("should answer 400 and update nothing when the level is unknown", async () => {
      const res = fakeRes();

      await handleUpdatePracticeSettings(fakeReq(JSON.stringify({ level: "Z9" })), res, "s1");

      expect(res.status).toBe(400);
      expect((res.body as { error: string }).error).toBe("invalid_input");
      expect(updatePracticeSettings).not.toHaveBeenCalled();
    });

    it("should save valid settings and answer 200", async () => {
      updatePracticeSettings.mockResolvedValue({ level: "C1_C2", pack: "General" });
      const res = fakeRes();

      await handleUpdatePracticeSettings(fakeReq(JSON.stringify({ level: "C1_C2" })), res, "s1");

      expect(res.status).toBe(200);
      expect(updatePracticeSettings).toHaveBeenCalledWith("s1", { level: "C1_C2" });
    });

    it("should generate a phrase batch at the saved level and pack", async () => {
      generatePhraseBatch.mockResolvedValue([{ id: "p1" }]);
      const res = fakeRes();

      await handleCreatePhraseBatch(res, "s1");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ phrases: [{ id: "p1" }] });
      expect(generatePhraseBatch).toHaveBeenCalledWith("s1", "B1_B2", "General");
    });

    it("should answer 400 and grade nothing when no answers are sent", async () => {
      const res = fakeRes();

      await handleCreateAttempts(fakeReq(JSON.stringify({ answers: [] })), res, "s1");

      expect(res.status).toBe(400);
      expect(gradeAttempts).not.toHaveBeenCalled();
    });

    it("should grade submitted answers and answer 200", async () => {
      gradeAttempts.mockResolvedValue({ attempts: [{ id: "a1" }], phraseBankUpdates: [] });
      const res = fakeRes();

      await handleCreateAttempts(
        fakeReq(JSON.stringify({ answers: [{ phraseId: "p1", userAnswer: "x" }] })),
        res,
        "s1",
      );

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ attempts: [{ id: "a1" }], phraseBankUpdates: [] });
    });

    it("should return the phrase bank summary", async () => {
      getPhraseBankSummary.mockResolvedValue({ total: 3 });
      const res = fakeRes();

      await handleGetPhraseBank(res, "s1");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ total: 3 });
    });

    it("should answer 400 and store nothing when the writing text is blank", async () => {
      const res = fakeRes();

      await handleCreateWritingCheck(fakeReq(JSON.stringify({ text: "   " })), res, "s1");

      expect(res.status).toBe(400);
      expect(gradeAndStoreWritingCheck).not.toHaveBeenCalled();
    });

    it("should grade and store a writing check", async () => {
      gradeAndStoreWritingCheck.mockResolvedValue({ id: "w1" });
      const res = fakeRes();

      await handleCreateWritingCheck(fakeReq(JSON.stringify({ text: "hello" })), res, "s1");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: "w1" });
      expect(gradeAndStoreWritingCheck).toHaveBeenCalledWith("s1", "hello");
    });

    it("should list writing checks for the subject", async () => {
      getWritingChecksForSubject.mockResolvedValue([{ id: "w1" }]);
      const res = fakeRes();

      await handleListWritingChecks(res, "s1");

      expect(res.status).toBe(200);
      expect(res.body).toEqual([{ id: "w1" }]);
    });
  });
});
