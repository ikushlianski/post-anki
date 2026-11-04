import { describe, expect, it } from "vitest";
import type { SubjectCreationOutput } from "../mastra/subject-creation.agent.js";
import {
  editDistance,
  validateSubjectCreation,
  type ExistingSubject,
  type SubjectCreationContext,
} from "./subject-creation.validate.js";

const subjects: ExistingSubject[] = [
  { id: "sub_eng", name: "Engineering", parentId: null, embedding: [1, 0] },
  { id: "sub_db", name: "Databases", parentId: "sub_eng", embedding: [1, 0] },
  { id: "sub_repl", name: "Replication", parentId: "sub_db", embedding: [1, 0] },
];

const context: SubjectCreationContext = {
  subjects,
  aliases: new Map([
    ["S1", "sub_eng"],
    ["S2", "sub_db"],
    ["S3", "sub_repl"],
  ]),
  sourceEmbedding: [0, 1],
};

function output(overrides: Partial<SubjectCreationOutput> = {}): SubjectCreationOutput {
  return { create: true, name: "Graph Theory", parentAlias: "S1", confidence: "high", reason: "r", ...overrides };
}

describe("validateSubjectCreation", () => {
  it("should approve a confident, distinct subject under an existing parent", () => {
    expect(validateSubjectCreation(output(), context)).toEqual({ create: true, name: "Graph Theory", parentId: "sub_eng" });
  });

  it("should allow a top-level subject when the model gives no parent", () => {
    expect(validateSubjectCreation(output({ parentAlias: null }), context)).toMatchObject({ create: true, parentId: null });
  });

  it("should not create anything when the model declines or is only medium confident", () => {
    expect(validateSubjectCreation(output({ create: false }), context)).toEqual({ create: false, reason: "not_confident" });
    expect(validateSubjectCreation(output({ confidence: "medium" }), context)).toEqual({ create: false, reason: "not_confident" });
  });

  it("should refuse a name that equals, contains or sits inside an existing subject name", () => {
    for (const name of ["databases", "Advanced Databases Design", "Engineering Management"]) {
      expect(validateSubjectCreation(output({ name }), context)).toEqual({ create: false, reason: "duplicate_name" });
    }
  });

  it("should refuse a near-duplicate spelling of an existing subject", () => {
    expect(validateSubjectCreation(output({ name: "Databasez" }), context)).toEqual({
      create: false,
      reason: "duplicate_name",
    });
  });

  it("should refuse a parent alias the model invented", () => {
    expect(validateSubjectCreation(output({ parentAlias: "S9" }), context)).toEqual({ create: false, reason: "bad_parent" });
  });

  it("should refuse a parent that is already at the maximum depth", () => {
    expect(validateSubjectCreation(output({ parentAlias: "S3" }), context)).toEqual({ create: false, reason: "bad_parent" });
  });

  it("should refuse names with markup, symbols or the wrong length", () => {
    for (const name of ["Graphs <b>", "Graph_Theory!", "G", "x".repeat(80), "Graph\u0000Theory"]) {
      expect(validateSubjectCreation(output({ name }), context)).toEqual({ create: false, reason: "bad_name" });
    }
  });

  it("should refuse when the note already resembles an existing subject", () => {
    expect(validateSubjectCreation(output(), { ...context, sourceEmbedding: [1, 0.1] })).toEqual({
      create: false,
      reason: "similar_subject_exists",
    });
  });

  it("should refuse when the note could not be embedded", () => {
    expect(validateSubjectCreation(output(), { ...context, sourceEmbedding: null })).toEqual({
      create: false,
      reason: "similar_subject_exists",
    });
  });
});

describe("editDistance", () => {
  it("should count single-character edits", () => {
    expect(editDistance("kitten", "sitting")).toBe(3);
    expect(editDistance("same", "same")).toBe(0);
  });
});
