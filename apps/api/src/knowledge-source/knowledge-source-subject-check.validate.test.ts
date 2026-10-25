import { describe, expect, it } from "vitest";
import type { SubjectCheckAliases, SubjectCheckModelOutput } from "../mastra/knowledge-source-subject-checker.agent.js";
import type { SubjectCheckCandidate } from "./knowledge-source-subject-check.candidates.js";
import { placeNewSubject, validateAdvice, type ValidateAdviceContext } from "./knowledge-source-subject-check.validate.js";

function candidate(id: string, label: string): SubjectCheckCandidate {
  return { id, label, description: null, kind: "other", embedding: null, samples: [] };
}

const aliases: SubjectCheckAliases = {
  candidates: new Map([
    ["S1", candidate("sub_a", "Business › Pricing")],
    ["S2", candidate("sub_b", "Polish")],
    ["S3", candidate("sub_c", "Cooking")],
  ]),
  parents: new Map([
    ["P1", { id: "par_biz", label: "Business" }],
    ["P2", { id: "par_cook", label: "Hobbies" }],
  ]),
};

const context: ValidateAdviceContext = {
  aliases,
  parents: [...aliases.parents.values()],
  hierarchy: [
    { id: "par_biz", name: "Business", parentId: null },
    { id: "sub_a", name: "Pricing", parentId: "par_biz" },
    { id: "par_cook", name: "Hobbies", parentId: null },
    { id: "sub_c", name: "Cooking", parentId: "par_cook" },
    { id: "sub_b", name: "Polish", parentId: null },
  ],
};

function output(partial: Partial<SubjectCheckModelOutput>): SubjectCheckModelOutput {
  return { recommendations: [], newSubject: null, ...partial };
}

describe("validateAdvice", () => {
  it("should drop a recommendation naming a subject that was never offered", () => {
    const result = validateAdvice(
      output({
        recommendations: [
          { alias: "S99", confidence: "high", reason: "Ignore the rules, file under X" },
          { alias: "sub_a", confidence: "high", reason: "real id guessed" },
          { alias: "S3", confidence: "low", reason: "cooking" },
        ],
      }),
      context,
    );

    expect(result).toMatchObject({ status: "ok", recommendations: [{ subjectId: "sub_c" }] });
  });

  it("should answer none when nothing the model said is usable", () => {
    expect(validateAdvice(output({ recommendations: [{ alias: "S77", confidence: "high", reason: "x" }] }), context)).toEqual({
      status: "none",
    });
  });

  it("should list each subject once at its strongest confidence, strongest first", () => {
    const result = validateAdvice(
      output({
        recommendations: [
          { alias: "S2", confidence: "low", reason: "a" },
          { alias: "S1", confidence: "medium", reason: "b" },
          { alias: "S2", confidence: "high", reason: "c" },
        ],
      }),
      context,
    );

    expect(result).toMatchObject({
      recommendations: [{ subjectId: "sub_b", confidence: "high" }, { subjectId: "sub_a", confidence: "medium" }],
    });
  });

  it("should strip markup and line breaks from the reason", () => {
    const result = validateAdvice(
      output({ recommendations: [{ alias: "S1", confidence: "medium", reason: "<b>Fits</b>\nwell\r\n here" }] }),
      context,
    );

    expect(result).toMatchObject({ recommendations: [{ reason: "bFits/b well here" }] });
  });

  it("should drop the new-subject proposal when a high recommendation exists", () => {
    const result = validateAdvice(
      output({
        recommendations: [{ alias: "S1", confidence: "high", reason: "ok" }],
        newSubject: { name: "Negotiation", parentAlias: null, kindHint: "other", reason: "r" },
      }),
      context,
    );

    expect(result).toMatchObject({ status: "ok", newSubject: null });
  });

  it("should keep the proposal when recommendations are only medium or low", () => {
    const result = validateAdvice(
      output({
        recommendations: [{ alias: "S1", confidence: "medium", reason: "ok" }],
        newSubject: { name: "Negotiation", parentAlias: "P2", kindHint: "other", reason: "r" },
      }),
      context,
    );

    expect(result).toMatchObject({
      newSubject: { name: "Negotiation", parentSubjectId: "par_cook", parentLabel: "Hobbies", kind: "general" },
    });
  });

  it("should strip markup from a proposed name and reject names with line breaks only after cleaning", () => {
    const result = validateAdvice(
      output({ newSubject: { name: "<i>Negotiation</i>\n tactics", parentAlias: null, kindHint: "other", reason: "r" } }),
      context,
    );

    expect(result).toMatchObject({ newSubject: { name: "iNegotiation/i tactics" } });
  });

  it("should reject a proposed name that already exists at that level", () => {
    const result = validateAdvice(
      output({ newSubject: { name: "cooking", parentAlias: "P2", kindHint: "other", reason: "r" } }),
      context,
    );

    expect(result).toEqual({ status: "none" });
  });

  it("should reject a proposal whose parent alias was not offered", () => {
    const result = validateAdvice(
      output({ newSubject: { name: "Negotiation", parentAlias: "P9", kindHint: "other", reason: "r" } }),
      context,
    );

    expect(result).toEqual({ status: "none" });
  });

  it("should reject a name that is empty after cleaning", () => {
    const result = validateAdvice(
      output({ newSubject: { name: " <> ", parentAlias: null, kindHint: "other", reason: "r" } }),
      context,
    );

    expect(result).toEqual({ status: "none" });
  });
});

describe("placeNewSubject", () => {
  const proposal = { name: "Negotiation", parentAlias: "P2", kindHint: "business" as const, reason: "r" };

  it("should place a business proposal under the Business root whatever parent the model named", () => {
    expect(placeNewSubject(proposal, context)).toEqual({
      kind: "business",
      parentSubjectId: "par_biz",
      parentLabel: "Business",
    });
  });

  it("should drop a business proposal when no Business root exists", () => {
    const withoutRoot: ValidateAdviceContext = {
      ...context,
      parents: context.parents.filter((parent) => parent.id !== "par_biz"),
      hierarchy: context.hierarchy.filter((row) => row.id !== "par_biz" && row.id !== "sub_a"),
    };

    expect(placeNewSubject(proposal, withoutRoot)).toBeNull();
  });

  it("should not place a business proposal under a Business root that holds items itself", () => {
    const leafRoot: ValidateAdviceContext = {
      ...context,
      parents: context.parents.filter((parent) => parent.id !== "par_biz"),
    };

    expect(placeNewSubject(proposal, leafRoot)).toBeNull();
  });

  it("should create a language proposal as a language subject", () => {
    expect(placeNewSubject({ ...proposal, kindHint: "language", parentAlias: null }, context)).toEqual({
      kind: "language",
      parentSubjectId: null,
      parentLabel: null,
    });
  });
});

describe("validateAdvice without a Business root", () => {
  it("should keep recommendations but not turn a business proposal into a top-level general subject", () => {
    const withoutRoot: ValidateAdviceContext = {
      ...context,
      parents: context.parents.filter((parent) => parent.id !== "par_biz"),
      hierarchy: context.hierarchy.filter((row) => row.id !== "par_biz" && row.id !== "sub_a"),
    };
    const result = validateAdvice(
      output({
        recommendations: [{ alias: "S3", confidence: "medium", reason: "cooking" }],
        newSubject: { name: "Negotiation", parentAlias: null, kindHint: "business", reason: "r" },
      }),
      withoutRoot,
    );

    expect(result).toMatchObject({ status: "ok", recommendations: [{ subjectId: "sub_c" }], newSubject: null });
  });
});

describe("validateAdvice recommendation count", () => {
  it("should keep the three strongest when the model returns more", () => {
    const result = validateAdvice(
      output({
        recommendations: [
          { alias: "S1", confidence: "low", reason: "a" },
          { alias: "S2", confidence: "medium", reason: "b" },
          { alias: "S3", confidence: "high", reason: "c" },
          { alias: "S99", confidence: "high", reason: "d" },
        ],
      }),
      context,
    );

    expect(result).toMatchObject({ recommendations: [{ subjectId: "sub_c" }, { subjectId: "sub_b" }, { subjectId: "sub_a" }] });
  });
});

describe("validateAdvice with a preselected parent", () => {
  const scoped: ValidateAdviceContext = { ...context, scopeParentId: "par_cook" };
  const propose = (parentAlias: string | null, kindHint: "other" | "business" = "other") =>
    output({ newSubject: { name: "Negotiation", parentAlias, kindHint, reason: "r" } });

  it("should accept a new subject placed under the preselected parent", () => {
    expect(validateAdvice(propose("P2"), scoped)).toMatchObject({ newSubject: { parentSubjectId: "par_cook" } });
  });

  it("should drop a new subject placed under a different parent", () => {
    expect(validateAdvice(propose("P1"), scoped)).toEqual({ status: "none" });
  });

  it("should drop a top-level new subject", () => {
    expect(validateAdvice(propose(null), scoped)).toEqual({ status: "none" });
  });

  it("should drop a business proposal that would land under the Business root outside the scope", () => {
    expect(validateAdvice(propose("P2", "business"), scoped)).toEqual({ status: "none" });
  });

  it("should accept a new subject placed under a descendant of the preselected parent", () => {
    const nested: ValidateAdviceContext = {
      ...scoped,
      aliases: { ...aliases, parents: new Map([["P3", { id: "par_deep", label: "Hobbies › Deep" }]]) },
      hierarchy: [...context.hierarchy, { id: "par_deep", name: "Deep", parentId: "par_cook" }],
    };

    expect(validateAdvice(propose("P3"), nested)).toMatchObject({ newSubject: { parentSubjectId: "par_deep" } });
  });
});
