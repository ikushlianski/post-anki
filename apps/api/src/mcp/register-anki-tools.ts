import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestAuthContext } from "../auth/request-auth-context.js";
import { getTagCards, getTagCardsInputSchema, getTagCardsResultSchema } from "./get-tag-cards.tool.js";
import { gradeCard, gradeCardInputSchema, gradeCardResultSchema } from "./grade-card.tool.js";
import { listDueCards, listDueCardsInputSchema, listDueCardsResultSchema } from "./list-due-cards.tool.js";
import { listSubjectTree, listSubjectsInputSchema, listSubjectsResultSchema } from "./list-subjects.tool.js";
import { listAllTags, listTagsInputSchema, listTagsResultSchema } from "./list-tags.tool.js";
import { moveCards, moveCardsInputSchema, moveCardsResultSchema } from "./move-cards.tool.js";
import { suspendCards, suspendCardsInputSchema, suspendCardsResultSchema, unsuspendCards } from "./suspend-cards.tool.js";
import { withToolErrorHandling } from "./tool-error-handling.js";

const ERROR_TEXT: Record<string, string> = {
  invalid_path: "Subject path is invalid: use an id or a path like \"A/B\" (max 2 levels).",
  subject_not_found: "Subject not found. List subjects with list_subjects or create it with add_subject.",
  not_found: "Not found.",
  variant_not_found: "Card variant not found.",
  not_approved: "This card is not approved, so it cannot be reviewed.",
};

function failure(error: string) {
  const text = error === "missing_scope" ? "Missing scope cards:write" : (ERROR_TEXT[error] ?? error);

  return { isError: true, content: [{ type: "text" as const, text }] };
}

function ok<T extends object>(value: T) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }], structuredContent: { ...value } };
}

function outcome<T extends object>(value: T | { error: string }) {
  return "error" in value ? failure(value.error) : ok(value);
}

export function registerAnkiReadTools(server: McpServer): void {
  server.registerTool(
    "list_subjects",
    {
      title: "List subjects",
      description: "List all subjects as a flat depth-first tree with ids, paths like \"English/Words\", parent ids and card counts.",
      inputSchema: listSubjectsInputSchema.shape,
      outputSchema: listSubjectsResultSchema.shape,
      annotations: { readOnlyHint: true },
    },
    withToolErrorHandling("list_subjects", async () => ok(await listSubjectTree())),
  );

  server.registerTool(
    "list_tags",
    {
      title: "List tags",
      description: "List all tags with their ids and names.",
      inputSchema: listTagsInputSchema.shape,
      outputSchema: listTagsResultSchema.shape,
      annotations: { readOnlyHint: true },
    },
    withToolErrorHandling("list_tags", async () => ok(await listAllTags())),
  );

  server.registerTool(
    "get_tag_cards",
    {
      title: "Get tag cards",
      description: "List the cards (knowledge bits) carrying a tag, by tag id from list_tags. Capped at 500 tagged items.",
      inputSchema: getTagCardsInputSchema.shape,
      outputSchema: getTagCardsResultSchema.shape,
      annotations: { readOnlyHint: true },
    },
    withToolErrorHandling("get_tag_cards", async (args) => outcome(await getTagCards(args))),
  );

  server.registerTool(
    "list_due_cards",
    {
      title: "List due cards",
      description:
        "List cards due for review now (the same queue as the app's review screen), optionally within a subject. Each card has a variantId for grade_card and the interval in days each grade would give.",
      inputSchema: listDueCardsInputSchema.shape,
      outputSchema: listDueCardsResultSchema.shape,
      annotations: { readOnlyHint: true },
    },
    withToolErrorHandling("list_due_cards", async (args) => outcome(await listDueCards(args))),
  );
}

export function registerAnkiWriteTools(server: McpServer, auth: RequestAuthContext): void {
  server.registerTool(
    "move_cards",
    {
      title: "Move cards",
      description:
        "Move up to 100 approved standalone cards to an existing subject (id or path). Cards that belong to a course or are not approved are skipped with a reason. Needs the cards:write scope.",
      inputSchema: moveCardsInputSchema.shape,
      outputSchema: moveCardsResultSchema.shape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    withToolErrorHandling("move_cards", async (args) => outcome(await moveCards(args, auth))),
  );

  server.registerTool(
    "suspend_cards",
    {
      title: "Suspend cards",
      description: "Take approved cards out of review until unsuspended. Their schedule is kept. Needs the cards:write scope.",
      inputSchema: suspendCardsInputSchema.shape,
      outputSchema: suspendCardsResultSchema.shape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    withToolErrorHandling("suspend_cards", async (args) => outcome(await suspendCards(args, auth))),
  );

  server.registerTool(
    "unsuspend_cards",
    {
      title: "Unsuspend cards",
      description: "Put suspended cards back into review. Needs the cards:write scope.",
      inputSchema: suspendCardsInputSchema.shape,
      outputSchema: suspendCardsResultSchema.shape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    withToolErrorHandling("unsuspend_cards", async (args) => outcome(await unsuspendCards(args, auth))),
  );

  server.registerTool(
    "grade_card",
    {
      title: "Grade card",
      description:
        "Record a review of one due card with again, hard, good or easy; the card is rescheduled and counts toward today's streak. Use the variantId from list_due_cards. Needs the cards:write scope.",
      inputSchema: gradeCardInputSchema.shape,
      outputSchema: gradeCardResultSchema.shape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    withToolErrorHandling("grade_card", async (args) => outcome(await gradeCard(args, auth))),
  );
}
