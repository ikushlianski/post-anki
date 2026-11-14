import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestAuthContext } from "../auth/request-auth-context.js";
import { SUBJECT_PATH_RULES } from "../subject/subject-path.js";
import { addSubject, addSubjectInputSchema, addSubjectResultSchema } from "./add-subject.tool.js";
import { chatAboutCard, chatAboutCardInputSchema, chatAboutCardResultSchema } from "./chat-about-card.tool.js";
import { createCard, createCardInputSchema, createCardResultSchema } from "./create-card.tool.js";
import { deleteCard, deleteCardInputSchema, deleteCardResultSchema } from "./delete-card.tool.js";
import { tagCards, tagCardsInputSchema, tagCardsResultSchema } from "./tag-cards.tool.js";
import { withToolErrorHandling } from "./tool-error-handling.js";
import { updateCard, updateCardInputSchema, updateCardResultSchema } from "./update-card.tool.js";

const ERROR_TEXT: Record<string, string> = {
  invalid_path: SUBJECT_PATH_RULES,
  invalid_parent: SUBJECT_PATH_RULES,
  parent_not_found: "Parent subject not found. Create it first with add_subject.",
  duplicate_card: "An identical card already exists.",
  not_found: "Card not found.",
  blocked: "This card is in a state that cannot be changed (for example rejected).",
  wrong_shape: "This card has no editable variant of the requested kind.",
  nothing_to_update: "Provide front, back or cloze to update.",
  nothing_to_do: "Provide at least one tag to add or remove.",
  not_in_chat: "This card cannot be discussed in its current state.",
  cap_reached: "The chat turn limit for this card is reached.",
  in_flight: "A reply for this card is already being generated.",
  budget_paused: "AI budget is paused.",
  model_failed: "The AI model failed to reply; try again.",
  no_messages: "Card has no chat messages.",
  proposal_not_pending: "Proposal is no longer pending.",
};

function errorResult(error: string, message?: string, scope = "cards:write") {
  const text = error === "missing_scope" ? `Missing scope ${scope}` : (message ?? ERROR_TEXT[error] ?? error);

  return { isError: true, content: [{ type: "text" as const, text }] };
}

function okResult<T extends object>(value: T) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }], structuredContent: { ...value } };
}

function outcomeResult<T extends object>(outcome: T | { error: string; message?: string }, scope?: string) {
  return "error" in outcome
    ? errorResult(outcome.error, "message" in outcome ? outcome.message : undefined, scope)
    : okResult(outcome);
}

export function registerCardWriteTools(server: McpServer, auth: RequestAuthContext): void {
  server.registerTool(
    "create_card",
    {
      title: "Create card",
      description:
        "Add one flashcard (front/back, or a cloze note) to a subject given as id or path like \"English/Words\". It lands in the same state as a card added by hand in the app. Needs the cards:write scope.",
      inputSchema: createCardInputSchema.shape,
      outputSchema: createCardResultSchema.shape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    withToolErrorHandling("create_card", async (args) => outcomeResult(await createCard(args, auth))),
  );

  server.registerTool(
    "update_card",
    {
      title: "Update card",
      description:
        "Edit a card's front and/or back, or the note of a cloze card. Omitted sides keep their current text. Needs the cards:write scope.",
      inputSchema: updateCardInputSchema.shape,
      outputSchema: updateCardResultSchema.shape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    withToolErrorHandling("update_card", async (args) => outcomeResult(await updateCard(args, auth))),
  );

  server.registerTool(
    "delete_card",
    {
      title: "Delete card",
      description:
        "Delete an approved card permanently with its reviews and schedule, or discard a pending card (moved to rejected). Needs the cards:write scope.",
      inputSchema: deleteCardInputSchema.shape,
      outputSchema: deleteCardResultSchema.shape,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    withToolErrorHandling("delete_card", async (args) => outcomeResult(await deleteCard(args, auth))),
  );

  server.registerTool(
    "tag_cards",
    {
      title: "Tag cards",
      description:
        "Add and/or remove tags (by name, case-insensitive; new names are created) on up to 100 cards. Returns each card's resulting tags. Needs the cards:write scope.",
      inputSchema: tagCardsInputSchema.shape,
      outputSchema: tagCardsResultSchema.shape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    withToolErrorHandling("tag_cards", async (args) => outcomeResult(await tagCards(args, auth))),
  );

  server.registerTool(
    "add_subject",
    {
      title: "Add subject",
      description:
        "Create a subject, optionally under an existing parent (id or path) to make a sub-subject. Needs the knowledge:write scope.",
      inputSchema: addSubjectInputSchema.shape,
      outputSchema: addSubjectResultSchema.shape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    withToolErrorHandling("add_subject", async (args) => outcomeResult(await addSubject(args, auth), "knowledge:write")),
  );

  server.registerTool(
    "chat_about_card",
    {
      title: "Chat about card",
      description:
        "Send one message in a card's crafting chat and get the tutor's reply plus any proposed new or revised cards (proposals are not saved). Uses AI budget and may search the web. Needs the knowledge:write scope.",
      inputSchema: chatAboutCardInputSchema.shape,
      outputSchema: chatAboutCardResultSchema.shape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    withToolErrorHandling("chat_about_card", async (args) => outcomeResult(await chatAboutCard(args, auth), "knowledge:write")),
  );
}
