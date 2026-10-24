import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  listKnowledgeSources,
  listKnowledgeSourcesInputSchema,
  listKnowledgeSourcesResultSchema,
} from "./list-knowledge-sources.tool.js";
import {
  getSourceKnowledgeBits,
  getSourceKnowledgeBitsInputSchema,
  getSourceKnowledgeBitsResultSchema,
} from "./get-source-knowledge-bits.tool.js";
import {
  getKnowledgeBit,
  getKnowledgeBitInputSchema,
  getKnowledgeBitResultSchema,
} from "./get-knowledge-bit.tool.js";
import { withToolErrorHandling } from "./tool-error-handling.js";

// Knowledge sources and bits: list_knowledge_sources, get_source_knowledge_bits, get_knowledge_bit.
export function registerKnowledgeSourceTools(server: McpServer): void {
  server.registerTool(
    "list_knowledge_sources",
    {
      title: "List knowledge sources",
      description:
        "List the learner's added knowledge sources newest first, with label, link, status and approved bit count, optionally filtered by subject, read-only.",
      inputSchema: listKnowledgeSourcesInputSchema.shape,
      outputSchema: listKnowledgeSourcesResultSchema.shape,
      annotations: {
        readOnlyHint: true,
      },
    },
    withToolErrorHandling("list_knowledge_sources", async ({ subjectId, limit, offset }) => {
      const result = await listKnowledgeSources({ subjectId, limit, offset });

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
        structuredContent: { ...result },
      };
    }),
  );

  server.registerTool(
    "get_source_knowledge_bits",
    {
      title: "Get source knowledge bits",
      description:
        "Get one knowledge source's approved knowledge bits in source order, each with its active study questions, read-only.",
      inputSchema: getSourceKnowledgeBitsInputSchema.shape,
      outputSchema: getSourceKnowledgeBitsResultSchema.shape,
      annotations: {
        readOnlyHint: true,
      },
    },
    withToolErrorHandling("get_source_knowledge_bits", async ({ sourceId, limit, offset }) => {
      const result = await getSourceKnowledgeBits({ sourceId, limit, offset });

      if ("error" in result) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `No knowledge source with id ${sourceId}` }],
        };
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
        structuredContent: { ...result },
      };
    }),
  );

  server.registerTool(
    "get_knowledge_bit",
    {
      title: "Get knowledge bit",
      description:
        "Get one knowledge bit by id (e.g. from a search hit) with its source, approval state and active study questions, read-only.",
      inputSchema: getKnowledgeBitInputSchema.shape,
      outputSchema: getKnowledgeBitResultSchema.shape,
      annotations: {
        readOnlyHint: true,
      },
    },
    withToolErrorHandling("get_knowledge_bit", async ({ id }) => {
      const result = await getKnowledgeBit({ id });

      if ("error" in result) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `No knowledge bit with id ${id}` }],
        };
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
        structuredContent: { ...result },
      };
    }),
  );
}
