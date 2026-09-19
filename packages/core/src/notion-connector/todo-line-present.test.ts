import { describe, expect, it } from "vitest";
import { isOpenTodoUnderDirection } from "./todo-line-present.js";

const todo = [
  "# Todo",
  "",
  "## sales",
  "",
  "### Coding tasks",
  "- [x] Track churn monthly",
  "- [ ] Call every lost lead",
  "",
  "## reading-notes",
  "",
  "### Scope",
  "- Notes",
  "",
  "### Coding tasks",
  "- [ ] Ask why deals stall",
  "  - [ ] Track churn monthly",
  "- [x] Read the pricing chapter",
  "",
  "### Notes",
  "- Track churn monthly",
  "",
].join("\n");

describe("isOpenTodoUnderDirection", () => {
  it("finds a note already open in the target direction's backlog", () => {
    expect(isOpenTodoUnderDirection(todo, "reading-notes", "Ask why deals stall")).toBe(true);
  });

  it("does not count a checked-off line as present", () => {
    expect(isOpenTodoUnderDirection(todo, "reading-notes", "Read the pricing chapter")).toBe(false);
  });

  it("does not count the same text living under another direction", () => {
    expect(isOpenTodoUnderDirection(todo, "reading-notes", "Call every lost lead")).toBe(false);
  });

  it("does not count a Notes bullet or a nested sub-item as the backlog item", () => {
    expect(isOpenTodoUnderDirection(todo, "reading-notes", "Track churn monthly")).toBe(false);
  });
});
