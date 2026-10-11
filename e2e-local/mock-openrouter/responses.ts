import { fillJsonSchemaResponseFormat, type JsonSchema } from './schema-fill';

export interface ChatRequestBody {
  model?: string;
  response_format?: {
    json_schema?: { schema?: JsonSchema };
  };
  messages?: { role?: string; content?: unknown }[];
}

export interface ResolvedCompletion {
  content: string;
  status?: number;
}

// Overridable per-run via POST /_mock/set-text — lets a dev script script a
// specific non-structured answer (e.g. for a socratic/study-chat action)
// without needing a schema-fill result. Structured-output calls always use
// fillJsonSchemaResponseFormat instead, since those responses must satisfy
// their schema or the calling agent throws.
let overrideText: string | null = null;
let forceErrorNext = false;

export type SourceItemsMode = 'good' | 'bad_quote';

let sourceItemsMode: SourceItemsMode = 'good';

export function setSourceItemsMode(mode: SourceItemsMode): void {
  sourceItemsMode = mode;
}

export function setOverrideText(text: string | null): void {
  overrideText = text;
}

export function setForceErrorNext(enabled: boolean): void {
  forceErrorNext = enabled;
}

export function resetMockControls(): void {
  overrideText = null;
  forceErrorNext = false;
  sourceItemsMode = 'good';
}

function lastUserText(body: ChatRequestBody): string {
  const messages = body.messages ?? [];
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');

  return typeof lastUser?.content === 'string' ? lastUser.content : '';
}

function isSourceItemsSchema(schema: JsonSchema | undefined): boolean {
  const items = (schema?.properties as { items?: { items?: { properties?: Record<string, unknown> } } } | undefined)
    ?.items?.items;

  return Boolean(items?.properties?.quote);
}

function extractSourceText(prompt: string): string {
  const match = /<source>\n([\s\S]*)\n<\/source>/.exec(prompt);

  return match?.[1] ?? prompt;
}

const BLANKABLE_WORD = /[\p{L}\p{N}]{4,}/gu;
const MAX_MOCK_SOURCE_ITEMS = 6;
const MIN_QUOTE_CHARS = 12;
const QUOTE_CHARS = 40;
const KIND_CYCLE = ['basic', 'why', 'fill_blank'] as const;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildFillBlankQuestion(statement: string, quote: string): { question: string; answer: string } | null {
  const word = [...quote.matchAll(BLANKABLE_WORD)].at(-1)?.[0];

  if (!word) {
    return null;
  }

  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(word)}(?![\\p{L}\\p{N}])`, 'u');

  return pattern.test(statement) ? { question: statement.replace(pattern, '____'), answer: word } : null;
}

function wholeWordExcerpt(sentence: string): string {
  const cut = sentence.slice(0, QUOTE_CHARS);

  if (sentence.length <= QUOTE_CHARS || /\s/u.test(sentence.charAt(QUOTE_CHARS))) {
    return cut.trim();
  }

  const lastSpace = cut.lastIndexOf(' ');

  return (lastSpace >= MIN_QUOTE_CHARS ? cut.slice(0, lastSpace) : cut).trim();
}

// Verbatim quotes taken from the pasted source so the real validators accept them; 'bad_quote' exercises the retry and failure path.
export function buildSourceItems(prompt: string, mode: SourceItemsMode): { items: Record<string, string>[] } {
  const sentences = extractSourceText(prompt)
    .split(/(?<=[.!?])\s+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= MIN_QUOTE_CHARS)
    .slice(0, MAX_MOCK_SOURCE_ITEMS);

  const items = sentences.map((sentence, index) => {
    const excerpt = wholeWordExcerpt(sentence);
    const quote = mode === 'bad_quote' ? `mock fabricated quote ${index} not in the source` : excerpt;
    const blank = KIND_CYCLE[index % KIND_CYCLE.length] === 'fill_blank' ? buildFillBlankQuestion(sentence, excerpt) : null;
    const asked = KIND_CYCLE[index % KIND_CYCLE.length];
    const kind: string = blank ? 'fill_blank' : asked === 'fill_blank' ? 'basic' : (asked ?? 'basic');
    const plainQuestion = kind === 'why' ? `Why does point ${index + 1} hold?` : `What is the claim in point ${index + 1}?`;

    return {
      kind,
      statement: sentence,
      question: blank?.question ?? plainQuestion,
      answer: blank?.answer ?? `Point ${index + 1}: ${excerpt}`,
      quote,
    };
  });

  return { items };
}

export function resolveContent(body: ChatRequestBody): ResolvedCompletion {
  if (forceErrorNext) {
    forceErrorNext = false;

    return { content: '', status: 502 };
  }

  const schema = body.response_format?.json_schema?.schema;

  if (schema && isSourceItemsSchema(schema)) {
    return { content: JSON.stringify(buildSourceItems(lastUserText(body), sourceItemsMode)) };
  }

  if (schema) {
    return { content: fillJsonSchemaResponseFormat(schema) };
  }

  if (overrideText !== null) {
    return { content: overrideText };
  }

  const prompt = lastUserText(body).slice(0, 120);

  return {
    content: `Mock response from e2e-local/mock-openrouter (no response_format schema on this call). Echoing the tail of the last user message for visibility: "${prompt}"`,
  };
}

export function debugDumpSchema(body: ChatRequestBody): void {
  const schema = body.response_format?.json_schema?.schema as
    | { properties?: Record<string, unknown> }
    | undefined;
  if (schema?.properties) {
    // eslint-disable-next-line no-console
    console.log('[debug schema.properties]', JSON.stringify(schema.properties, null, 2));
  }
}
