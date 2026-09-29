import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { listDecks, listDecksInputSchema, listDecksResultSchema } from "./list-decks.tool.js";
import { listCourses, listCoursesInputSchema, listCoursesResultSchema } from "./list-courses.tool.js";
import {
  getCourseStructure,
  getCourseStructureInputSchema,
  getCourseStructureResultSchema,
} from "./get-course-structure.tool.js";
import { withToolErrorHandling } from "./tool-error-handling.js";

// Deck/course/module/topic browsing: list_decks, list_courses, get_course_structure.
export function registerBrowseTools(server: McpServer): void {
  server.registerTool(
    "list_decks",
    {
      title: "List decks",
      description:
        "List the learner's language-practice decks (subjects whose kind is language-practice), read-only.",
      inputSchema: listDecksInputSchema.shape,
      outputSchema: listDecksResultSchema.shape,
      annotations: {
        readOnlyHint: true,
      },
    },
    withToolErrorHandling("list_decks", async ({ limit, offset }) => {
      const result = await listDecks({ limit, offset });

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
        structuredContent: { ...result },
      };
    }),
  );

  server.registerTool(
    "list_courses",
    {
      title: "List courses",
      description: "List the learner's courses (non-container curricula), optionally filtered by subject, read-only.",
      inputSchema: listCoursesInputSchema.shape,
      outputSchema: listCoursesResultSchema.shape,
      annotations: {
        readOnlyHint: true,
      },
    },
    withToolErrorHandling("list_courses", async ({ subjectId, limit, offset }) => {
      const result = await listCourses({ subjectId, limit, offset });

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
        structuredContent: { ...result },
      };
    }),
  );

  server.registerTool(
    "get_course_structure",
    {
      title: "Get course structure",
      description: "Get a course's modules and topics in order, with each topic's card-set status, read-only.",
      inputSchema: getCourseStructureInputSchema.shape,
      outputSchema: getCourseStructureResultSchema.shape,
      annotations: {
        readOnlyHint: true,
      },
    },
    withToolErrorHandling("get_course_structure", async ({ curriculumId }) => {
      const result = await getCourseStructure({ curriculumId });

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
}
