import { z } from "zod";

export const KNOWLEDGE_SOURCE_MAX_CHARS = 50_000;

const REFUSAL_SENTENCES = {
  fetch_failed: "That page could not be opened.",
  empty_content: "That page has no readable text.",
  subject_not_found: "The chosen subject no longer exists. Pick another subject.",
  subject_has_children: "This subject has sub-subjects. Choose one of them.",
  already_added: "This was already added.",
  text_too_long: `This text is longer than ${KNOWLEDGE_SOURCE_MAX_CHARS.toLocaleString("en-US")} characters. Split it into smaller blocks.`,
} as const;

export type KnowledgeSourceRefusalCode = keyof typeof REFUSAL_SENTENCES;

export const KNOWLEDGE_SOURCE_TRUNCATED_NOTICE = `Only the first ${KNOWLEDGE_SOURCE_MAX_CHARS.toLocaleString("en-US")} characters of the page were read.`;

const REFUSAL_MESSAGE_PREFIX = "refusal:";

export function isKnowledgeSourceRefusalCode(code: unknown): code is KnowledgeSourceRefusalCode {
  return typeof code === "string" && Object.prototype.hasOwnProperty.call(REFUSAL_SENTENCES, code);
}

export function describeKnowledgeSourceRefusal(code: KnowledgeSourceRefusalCode): string {
  return REFUSAL_SENTENCES[code];
}

const duplicateSchema = z.object({
  index: z.number().int().nonnegative().optional(),
  existingId: z.string().min(1),
  addedAt: z.string().min(1),
});

export type KnowledgeSourceDuplicate = {
  index?: number;
  existingId: string;
  addedAt: string;
};

const DETAILS_SEPARATOR = "#";

function duplicatesFromDetails(details: unknown): KnowledgeSourceDuplicate[] {
  const parsed = z.object({ duplicates: z.array(duplicateSchema) }).safeParse(details);

  return parsed.success ? parsed.data.duplicates : [];
}

export function encodeKnowledgeSourceRefusal(error: unknown): unknown {
  const code = (error as { code?: unknown } | null)?.code;

  if (!isKnowledgeSourceRefusalCode(code)) {
    return error;
  }

  if (code !== "already_added") {
    return new Error(`${REFUSAL_MESSAGE_PREFIX}${code}`);
  }

  const duplicates = duplicatesFromDetails((error as { details?: unknown }).details);

  return new Error(`${REFUSAL_MESSAGE_PREFIX}${code}${DETAILS_SEPARATOR}${JSON.stringify(duplicates)}`);
}

export function knowledgeSourceDuplicatesFromError(error: unknown): KnowledgeSourceDuplicate[] {
  const message = error instanceof Error ? error.message : "";
  const prefix = `${REFUSAL_MESSAGE_PREFIX}already_added${DETAILS_SEPARATOR}`;

  if (!message.startsWith(prefix)) {
    return duplicatesFromDetails((error as { details?: unknown } | null)?.details);
  }

  try {
    return duplicatesFromDetails({ duplicates: JSON.parse(message.slice(prefix.length)) });
  } catch {
    return [];
  }
}

export function knowledgeSourceRefusalFromError(error: unknown): KnowledgeSourceRefusalCode | null {
  const code = (error as { code?: unknown } | null)?.code;

  if (isKnowledgeSourceRefusalCode(code)) {
    return code;
  }

  const message = error instanceof Error ? error.message : "";

  if (!message.startsWith(REFUSAL_MESSAGE_PREFIX)) {
    return null;
  }

  const encoded = message.slice(REFUSAL_MESSAGE_PREFIX.length).split(DETAILS_SEPARATOR)[0];

  return isKnowledgeSourceRefusalCode(encoded) ? encoded : null;
}
