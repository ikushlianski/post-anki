import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestAuthContext } from "../auth/request-auth-context.js";
import { askMyCards, askMyCardsInputSchema, askMyCardsResultSchema } from "./ask-my-cards.tool.js";
import { cardSchema, getCard, getCardInputSchema, getCards, getCardsInputSchema, getCardsResultSchema } from "./get-cards.tool.js";
import { searchCards, searchCardsInputSchema, searchCardsResultSchema } from "./search-cards.tool.js";
import { withToolErrorHandling } from "./tool-error-handling.js";

const ERROR_TEXT: Record<string, string> = {
  invalid_path: "Subject path is invalid: use an id or a path like \"A/B\" (max 2 levels).",
  subject_not_found: "Subject not found. List subjects with list_subjects.",
  tag_not_found: "Tag not found. List tags with list_tags.",
  not_found: "Card not found.",
};

function failure(error: string) {
  const text = error === "missing_scope" ? "Missing scope knowledge:write" : (ERROR_TEXT[error] ?? error);

  return { isError: true, content: [{ type: "text" as const, text }] };
}

function outcome<T extends object>(value: T | { error: string }) {
  return "error" in value
    ? failure(value.error)
    : { content: [{ type: "text" as const, text: JSON.stringify(value) }], structuredContent: { ...value } };
}

export function registerCardReadTools(server: McpServer, auth: RequestAuthContext): void {
  server.registerTool(
    "get_cards",
    {
      title: "Get cards",
      description:
        "Get 1 to 100 cards by id, each with every question variant (front, back, cloze text), subject, tags, status, suspended flag, schedule (due date, interval, phase, lapses; null if never studied) and source title. Unknown ids come back in notFound.",
      inputSchema: getCardsInputSchema.shape,
      outputSchema: getCardsResultSchema.shape,
      annotations: { readOnlyHint: true },
    },
    withToolErrorHandling("get_cards", async (args) => outcome(await getCards(args))),
  );

  server.registerTool(
    "get_card",
    {
      title: "Get card",
      description: "Get one card by id; same detail as get_cards.",
      inputSchema: getCardInputSchema.shape,
      outputSchema: { card: cardSchema },
      annotations: { readOnlyHint: true },
    },
    withToolErrorHandling("get_card", async (args) => outcome(await getCard(args))),
  );

  server.registerTool(
    "search_cards",
    {
      title: "Search cards",
      description:
        "Find approved cards the way the app's Knowledge search does: substring match on front or back, optionally within a subject (with sub-subjects), with a tag (id or name) and by suspended state. Returns compact rows (id, front, back snippet, subject path, tags, suspended, due), newest first, paged by limit/offset. Unlike search_knowledge_items, which ranks mixed content (cards, topics, modules, tag names) by full-text relevance, this lists only cards and filters them exactly. To check whether a draft card already exists, use check_duplicates instead.",
      inputSchema: searchCardsInputSchema.shape,
      outputSchema: searchCardsResultSchema.shape,
      annotations: { readOnlyHint: true },
    },
    withToolErrorHandling("search_cards", async (args) => outcome(await searchCards(args))),
  );

  server.registerTool(
    "ask_my_cards",
    {
      title: "Ask my cards",
      description:
        "Ask a question answered from the user's own cards (the app's global card chat). Returns the answer and the cards it drew on. Uses AI budget; may use the model's own reach. Needs the knowledge:write scope.",
      inputSchema: askMyCardsInputSchema.shape,
      outputSchema: askMyCardsResultSchema.shape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    withToolErrorHandling("ask_my_cards", async (args) => outcome(await askMyCards(args, auth))),
  );
}

