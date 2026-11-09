import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestAuthContext } from "../auth/request-auth-context.js";
import { SUBJECT_PATH_RULES } from "../subject/subject-path.js";
import { BUSINESS_DECK_TO_SUBJECT } from "./business-deck-mapping.js";
import {
  submitKnowledge,
  submitKnowledgeInputSchema,
  submitKnowledgeResultSchema,
} from "./submit-knowledge.tool.js";
import {
  submitKnowledgeToSubject,
  submitKnowledgeToSubjectInputSchema,
  submitKnowledgeToSubjectResultSchema,
} from "./submit-knowledge-to-subject.tool.js";
import { withToolErrorHandling } from "./tool-error-handling.js";

function errorResult(text: string) {
  return { isError: true, content: [{ type: "text" as const, text }] };
}

// Writing tools: file raw notes as pending knowledge sources.
export function registerWriteTools(server: McpServer, auth: RequestAuthContext): void {
  server.registerTool(
    "submit_knowledge",
    {
      title: "Submit knowledge",
      description:
        "File up to 100 keyed raw text notes as pending knowledge sources under the Business sub-subject mapped from the deck name. Raw text only, no cards. Needs the knowledge:write scope. Notes whose key already exists are skipped, so retrying a batch adds nothing.",
      inputSchema: submitKnowledgeInputSchema.shape,
      outputSchema: submitKnowledgeResultSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    withToolErrorHandling("submit_knowledge", async ({ deck, notes }) => {
      const result = await submitKnowledge({ deck, notes }, auth);

      if ("error" in result) {
        if (result.error === "missing_scope") {
          return errorResult("Missing scope knowledge:write");
        }

        if (result.error === "unknown_deck") {
          const accepted = Object.keys(BUSINESS_DECK_TO_SUBJECT).join(", ");

          return errorResult(`Unknown deck "${deck}". Accepted decks: ${accepted}`);
        }

        return errorResult(
          `Business sub-subject "${result.subjectName}" does not exist. Run the db:seed:business-sub-subjects script.`,
        );
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
        structuredContent: { ...result },
      };
    }),
  );

  server.registerTool(
    "submit_knowledge_to_subject",
    {
      title: "Submit knowledge to subject",
      description:
        "File up to 100 keyed raw text notes as pending knowledge sources under a subject path (max 2 levels, e.g. \"Work/AIPeak\"), creating missing subjects. Raw text only, no cards. Notes whose key already exists are skipped, so retrying a batch adds nothing. Needs the knowledge:write scope.",
      inputSchema: submitKnowledgeToSubjectInputSchema.shape,
      outputSchema: submitKnowledgeToSubjectResultSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    withToolErrorHandling("submit_knowledge_to_subject", async ({ subjectPath, notes }) => {
      const result = await submitKnowledgeToSubject({ subjectPath, notes }, auth);

      if ("error" in result) {
        return errorResult(
          result.error === "missing_scope" ? "Missing scope knowledge:write" : SUBJECT_PATH_RULES,
        );
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
        structuredContent: { ...result },
      };
    }),
  );
}
