// Generic JSON-Schema-to-plausible-value filler. This is the part of the
// pattern worth porting from verification-repo's mock-openrouter/responses.ts
// — NOT its 1200+ lines of hand-written per-scenario stub plans
// (CURRICULUM_STUB_PLAN etc.), which are specific to that repo's ticket
// history. Reading the *shape* the caller asked for (via
// response_format.json_schema.schema, the strict-mode structured-output
// contract Mastra/OpenRouter uses — see project memory
// project_openrouter_websearch_no_structured.md) and synthesizing a
// minimally-valid value from it means this mock never goes stale as new
// agents/schemas are added to this app — no hand-written stub needs to be
// kept in sync with every curriculum/probe schema change.
export type JsonSchema = Record<string, unknown>;

let counter = 0;

function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

function isNullable(schema: JsonSchema): boolean {
  const type = schema.type;

  if (Array.isArray(type)) {
    return type.includes('null');
  }

  const variants = (schema.anyOf ?? schema.oneOf) as JsonSchema[] | undefined;

  return Array.isArray(variants) && variants.some((v) => v.type === 'null');
}

function baseType(schema: JsonSchema): string | undefined {
  const type = schema.type;

  if (typeof type === 'string') {
    return type;
  }

  if (Array.isArray(type)) {
    return type.find((t) => t !== 'null');
  }

  const variants = (schema.anyOf ?? schema.oneOf) as JsonSchema[] | undefined;

  if (Array.isArray(variants)) {
    const nonNull = variants.find((v) => v.type !== 'null');

    return nonNull ? baseType(nonNull) : undefined;
  }

  return undefined;
}

export function fillSchema(schema: JsonSchema, path = 'value'): unknown {
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum[0];
  }

  const type = baseType(schema);

  switch (type) {
    case 'string':
      return `mock-${path}-${nextId('str')}`;
    case 'number':
    case 'integer':
      return 1;
    case 'boolean':
      return false;
    case 'array': {
      const items = (schema.items ?? {}) as JsonSchema;
      const minItems = typeof schema.minItems === 'number' ? schema.minItems : 1;

      return Array.from({ length: Math.max(minItems, 1) }, (_, i) =>
        fillSchema(items, `${path}[${i}]`),
      );
    }
    case 'object':
    default: {
      const properties = (schema.properties ?? {}) as Record<string, JsonSchema>;
      const required = new Set((schema.required as string[] | undefined) ?? []);
      const result: Record<string, unknown> = {};

      for (const [key, propSchema] of Object.entries(properties)) {
        // Nullable wins over required: OpenRouter/Mastra strict-mode
        // structured output (see project memory
        // project_openrouter_websearch_no_structured.md) commonly marks a
        // field BOTH required (every key must be present) AND nullable
        // (.nullable(), not .optional()) — e.g. this app's
        // modulePlanSchema.tags. `null` always satisfies "nullable"
        // regardless of required-ness, and is simpler/safer than
        // synthesizing a fake value whose shape might not match what the
        // real caller expects for an optional field it usually leaves
        // unset.
        if (isNullable(propSchema)) {
          result[key] = null;
          continue;
        }

        if (!required.has(key)) {
          continue;
        }

        result[key] = fillSchema(propSchema, `${path}.${key}`);
      }

      return result;
    }
  }
}

export function fillJsonSchemaResponseFormat(schema: JsonSchema): string {
  return JSON.stringify(fillSchema(schema));
}
