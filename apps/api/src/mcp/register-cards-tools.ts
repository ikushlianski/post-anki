import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  getTopicCards,
  getTopicCardsInputSchema,
  getTopicCardsResultSchema,
} from "./get-topic-cards.tool.js";
import {
  listCourseCards,
  listCourseCardsInputSchema,
  listCourseCardsResultSchema,
} from "./list-course-cards.tool.js";
import {
  getDeckItems,
  getDeckItemsInputSchema,
  getDeckItemsResultSchema,
} from "./get-deck-items.tool.js";
import { withToolErrorHandling } from "./tool-error-handling.js";

// Study-card and deck-item access: get_topic_cards, list_course_cards, get_deck_items.
export function registerCardsTools(server: McpServer): void {
  server.registerTool(
    "get_topic_cards",
    {
      title: "Get topic cards",
      description:
        "Get a topic's study cards with every prompt/answer variant, read-only. A generating or failed card set returns its status with an empty card list.",
      inputSchema: getTopicCardsInputSchema.shape,
      outputSchema: getTopicCardsResultSchema.shape,
      annotations: {
        readOnlyHint: true,
      },
    },
    withToolErrorHandling("get_topic_cards", async ({ topicId }) => {
      const result = await getTopicCards({ topicId });

      if (!result) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `No card set for topic ${topicId}` }],
        };
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
        structuredContent: { ...result },
      };
    }),
  );

  server.registerTool(
    "list_course_cards",
    {
      title: "List course cards",
      description: "List a course's ready study cards, flattened one row per prompt/answer variant, read-only.",
      inputSchema: listCourseCardsInputSchema.shape,
      outputSchema: listCourseCardsResultSchema.shape,
      annotations: {
        readOnlyHint: true,
      },
    },
    withToolErrorHandling("list_course_cards", async ({ curriculumId, limit, offset }) => {
      const result = await listCourseCards({ curriculumId, limit, offset });

      if (!result) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `No course with id ${curriculumId}` }],
        };
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
        structuredContent: { ...result },
      };
    }),
  );

  server.registerTool(
    "get_deck_items",
    {
      title: "Get deck items",
      description: "List a deck's phrase items, read-only.",
      inputSchema: getDeckItemsInputSchema.shape,
      outputSchema: getDeckItemsResultSchema.shape,
      annotations: {
        readOnlyHint: true,
      },
    },
    withToolErrorHandling("get_deck_items", async ({ subjectId, limit, offset }) => {
      const result = await getDeckItems({ subjectId, limit, offset });

      if ("error" in result) {
        const text =
          result.error === "not_found"
            ? `No subject with id ${subjectId}`
            : `Subject ${subjectId} is not a deck`;

        return {
          isError: true,
          content: [{ type: "text" as const, text }],
        };
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
        structuredContent: { ...result },
      };
    }),
  );
}
