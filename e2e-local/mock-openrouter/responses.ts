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

export function setOverrideText(text: string | null): void {
  overrideText = text;
}

export function setForceErrorNext(enabled: boolean): void {
  forceErrorNext = enabled;
}

export function resetMockControls(): void {
  overrideText = null;
  forceErrorNext = false;
}

function lastUserText(body: ChatRequestBody): string {
  const messages = body.messages ?? [];
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');

  return typeof lastUser?.content === 'string' ? lastUser.content : '';
}

export function resolveContent(body: ChatRequestBody): ResolvedCompletion {
  if (forceErrorNext) {
    forceErrorNext = false;

    return { content: '', status: 502 };
  }

  const schema = body.response_format?.json_schema?.schema;

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
