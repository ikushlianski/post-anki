import { describe, expect, it } from "vitest";
import { buildSubjectMenu, buildTokenRejectedMenu, subjectIdFromMenuId } from "./build-subject-menu.js";

const subjects = [
  { id: "biz", name: "Business" },
  { id: "hr", name: "HR", parentId: "biz" },
  { id: "mkt", name: "Marketing", parentId: "biz" },
  { id: "pl", name: "Polish" },
];

describe("buildSubjectMenu", () => {
  it("should name the remembered subject in the one-click entry", () => {
    expect(buildSubjectMenu(subjects, "hr")[0]?.title).toBe("Send to post-anki: HR");
  });

  it("should say no subject when none is remembered", () => {
    expect(buildSubjectMenu(subjects, undefined)[0]?.title).toBe("Send to post-anki (no subject)");
  });

  it("should nest sub-subjects under their subject, two levels deep", () => {
    const entries = buildSubjectMenu(subjects, undefined);

    expect(entries.find((entry) => entry.id === "subject:hr")?.parentId).toBe("group:biz");
    expect(entries.find((entry) => entry.id === "group:biz")?.parentId).toBe("pick-subject");
    expect(entries.find((entry) => entry.id === "subject:pl")?.parentId).toBe("pick-subject");
  });

  it("should let a subject with sub-subjects be picked itself", () => {
    expect(buildSubjectMenu(subjects, undefined).find((entry) => entry.id === "subject:biz")?.title).toBe("Business (general)");
  });

  it("should offer only the one-click entry when no subjects are known", () => {
    expect(buildSubjectMenu([], undefined)).toHaveLength(1);
  });

  it("should read a subject id back from a menu id", () => {
    expect(subjectIdFromMenuId("subject:hr")).toBe("hr");
    expect(subjectIdFromMenuId("send-current")).toBeNull();
  });

  it("should nest a third level with its own general entry so deep subjects are reachable", () => {
    const entries = buildSubjectMenu(
      [
        { id: "biz", name: "Business" },
        { id: "hr", name: "HR", parentId: "biz" },
        { id: "rec", name: "Recruiting", parentId: "hr" },
        { id: "sourcing", name: "Sourcing", parentId: "rec" },
      ],
      undefined,
    );

    expect(entries.find((entry) => entry.id === "group:hr")?.parentId).toBe("group:biz");
    expect(entries.find((entry) => entry.id === "subject:hr")).toMatchObject({ title: "HR (general)", parentId: "group:hr" });
    expect(entries.find((entry) => entry.id === "group:rec")?.parentId).toBe("group:hr");
    expect(entries.find((entry) => entry.id === "subject:rec")).toMatchObject({ title: "Recruiting (general)", parentId: "group:rec" });
    expect(entries.find((entry) => entry.id === "subject:sourcing")).toMatchObject({ title: "Sourcing", parentId: "group:rec" });
  });

  it("should offer a single entry that sends the user to options when the token is rejected", () => {
    expect(buildTokenRejectedMenu()).toEqual([{ id: "token-rejected", title: "Token rejected: open extension options" }]);
  });
});
