import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TopicCandidate } from "./topic-match.js";

const getSubjects = vi.fn();
const getCurricula = vi.fn();
const getCurriculumDetail = vi.fn();

vi.mock("../api/client.js", () => ({
  getSubjects: (...a: unknown[]) => getSubjects(...a),
  getCurricula: (...a: unknown[]) => getCurricula(...a),
  getCurriculumDetail: (...a: unknown[]) => getCurriculumDetail(...a),
}));

const { isSteerShaped, matchTopicTitle, findRegisteredTopic } = await import("./topic-match.js");

function candidate(over: Partial<TopicCandidate> = {}): TopicCandidate {
  return {
    topicId: "t1",
    curriculumId: "c1",
    title: "AWS Lambda",
    topicStatus: "in_progress",
    ...over,
  };
}

describe("isSteerShaped (AC 10, 11)", () => {
  it("accepts a short phrase with no comma and no sentence-internal punctuation", () => {
    expect(isSteerShaped("lambda cold starts")).toBe(true);
  });

  it("accepts a dotted product name with no following space", () => {
    expect(isSteerShaped("Node.js")).toBe(true);
  });

  it("rejects an empty or whitespace-only message", () => {
    expect(isSteerShaped("")).toBe(false);
    expect(isSteerShaped("   ")).toBe(false);
  });

  it("rejects a message longer than 40 characters", () => {
    expect(isSteerShaped("a".repeat(41))).toBe(false);
  });

  it("rejects a message containing a comma", () => {
    expect(isSteerShaped("AWS Lambda, please")).toBe(false);
  });

  it("rejects sentence-internal punctuation followed by more text", () => {
    expect(isSteerShaped("Wait. Let's talk about Lambda")).toBe(false);
  });

  it("rejects the exact real-answer sentence from the issue body (AC 18)", () => {
    const answer =
      "Unlike Kubernetes, Lambda keeps the container warm between invocations if traffic is frequent enough, which avoids the cold-start penalty on repeat calls.";

    expect(isSteerShaped(answer)).toBe(false);
  });

  it("accepts trailing terminal punctuation with nothing following it", () => {
    expect(isSteerShaped("AWS Lambda?")).toBe(true);
  });
});

describe("matchTopicTitle (AC 12)", () => {
  it("returns null for an empty candidate list", () => {
    expect(matchTopicTitle("lambda", [])).toBeNull();
  });

  it("returns null when no candidate shares a significant word", () => {
    expect(matchTopicTitle("quantum stuff", [candidate({ title: "AWS Lambda" })])).toBeNull();
  });

  it("matches the exact 'lambda cold starts' -> 'AWS Lambda' case from the issue body", () => {
    const lambda = candidate({ topicId: "lam", title: "AWS Lambda" });
    const stepFns = candidate({ topicId: "sf", title: "AWS Step Functions" });

    expect(matchTopicTitle("lambda cold starts", [stepFns, lambda])).toEqual(lambda);
  });

  it("scores by count of shared significant words, picking the higher-scoring candidate", () => {
    const lambda = candidate({ topicId: "lam", title: "AWS Lambda" });
    const kubernetes = candidate({ topicId: "k8s", title: "Kubernetes" });

    expect(matchTopicTitle("AWS Lambda basics", [kubernetes, lambda])).toEqual(lambda);
  });

  it("ties break toward the shorter/more specific title", () => {
    const short = candidate({ topicId: "short", title: "AWS" });
    const long = candidate({ topicId: "long", title: "AWS Fundamentals" });

    expect(matchTopicTitle("aws", [long, short])).toEqual(short);
  });

  it("ignores stopwords and words under 3 characters when scoring", () => {
    const target = candidate({ topicId: "t", title: "Go" });

    expect(matchTopicTitle("the go language", [target])).toBeNull();
  });
});

describe("findRegisteredTopic (AC 12 I/O wiring)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fans out subjects -> curricula -> curriculum details, keeps only confirmed curricula and included topics, and scores by title", async () => {
    getSubjects.mockResolvedValue([{ id: "s1" }]);
    getCurricula.mockResolvedValue([
      { id: "c1", status: "confirmed" },
      { id: "c2", status: "draft" },
    ]);
    getCurriculumDetail.mockResolvedValue({
      curriculum: { id: "c1" },
      modules: [
        {
          topics: [
            { id: "top1", title: "AWS Lambda", included: true, progress: { status: "in_progress" } },
            { id: "top2", title: "Excluded Topic", included: false, progress: { status: "not_started" } },
          ],
        },
      ],
    });

    const result = await findRegisteredTopic("lambda cold starts");

    expect(getCurriculumDetail).toHaveBeenCalledTimes(1);
    expect(getCurriculumDetail).toHaveBeenCalledWith("c1");
    expect(result).toEqual({
      topicId: "top1",
      curriculumId: "c1",
      title: "AWS Lambda",
      topicStatus: "in_progress",
    });
  });

  it("returns null when nothing matches", async () => {
    getSubjects.mockResolvedValue([]);
    getCurricula.mockResolvedValue([]);
    getCurriculumDetail.mockResolvedValue(undefined);

    expect(await findRegisteredTopic("quantum stuff")).toBeNull();
  });
});
