import { z } from "zod";

export const notionSourceSchema = z.object({
  kind: z.enum(["page", "database"]),
  id: z.string().min(1),
});

export type NotionSource = z.infer<typeof notionSourceSchema>;

export const notionDestinationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("fact") }),
  z.object({
    kind: z.literal("project-todo"),
    file: z.string().min(1),
    direction: z.string().min(1),
  }),
  z.object({
    kind: z.literal("knowledge-source"),
    subjectPath: z.string().min(1),
    maxPerRun: z.number().int().positive().default(10),
    deleteAfterImport: z.boolean().default(true),
  }),
]);

export type NotionDestination = z.infer<typeof notionDestinationSchema>;

export const notionConnectorSchema = z.object({
  name: z.string().min(1),
  source: notionSourceSchema,
  tag: z
    .string()
    .regex(/^[A-Z0-9]{2,8}$/)
    .optional(),
  destination: notionDestinationSchema,
  removeAfterImport: z.boolean().default(false),
  intervalMinutes: z.number().int().positive().optional(),
  enabled: z.boolean().default(true),
}).superRefine((connector, ctx) => {
  if (connector.destination.kind !== "knowledge-source" && !connector.tag) {
    ctx.addIssue({ code: "custom", path: ["tag"], message: "tag is required for this destination" });
  }
});

export type KnowledgeSourceDestination = Extract<NotionDestination, { kind: "knowledge-source" }>;
export type KnowledgeSourceConnector = NotionConnector & { destination: KnowledgeSourceDestination };

export function isKnowledgeSourceConnector(connector: NotionConnector): connector is KnowledgeSourceConnector {
  return connector.destination.kind === "knowledge-source";
}

export type NotionConnector = z.infer<typeof notionConnectorSchema>;

export const notionConnectorConfigSchema = z.object({
  connectors: z.array(notionConnectorSchema),
});

export type NotionConnectorConfig = z.infer<typeof notionConnectorConfigSchema>;

export const notionItemSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
  tags: z.array(z.string()),
  lastEditedTime: z.string(),
});

export type NotionItem = z.infer<typeof notionItemSchema>;
