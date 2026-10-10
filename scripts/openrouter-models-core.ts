import { z } from "zod";

const TOKENS_PER_MILLION = 1_000_000;
const OUTPUT_WEIGHT_IN_BLEND = 0.3;
const STRUCTURED_OUTPUTS_PARAMETER = "structured_outputs";

export const SORT_KEYS = ["output", "input", "blend"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export interface ListOptions {
  structuredOnly: boolean;
  limit: number;
  sort: SortKey;
  search: string | null;
}

export interface ModelRow {
  id: string;
  name: string;
  inputPerMillion: number;
  outputPerMillion: number;
  contextLength: number | null;
  createdAt: string | null;
  knowledgeCutoff: string | null;
  expirationDate: string | null;
  structuredOutputs: boolean;
}

const pricePerToken = z.string();

const modelEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  created: z.number().nullable().optional(),
  context_length: z.number().nullable().optional(),
  pricing: z.object({
    prompt: pricePerToken,
    completion: pricePerToken,
  }),
  supported_parameters: z.array(z.string()).nullable().optional(),
  knowledge_cutoff: z.string().nullable().optional(),
  expiration_date: z.string().nullable().optional(),
});

const modelsResponseSchema = z.object({
  data: z.array(z.unknown()),
});

export const DEFAULT_LIST_OPTIONS: ListOptions = {
  structuredOnly: true,
  limit: 20,
  sort: "blend",
  search: null,
};

export function parsePricePerToken(raw: string): number | null {
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function toIsoDate(unixSeconds: number | null | undefined): string | null {
  if (typeof unixSeconds !== "number" || !Number.isFinite(unixSeconds)) {
    return null;
  }
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

function toRow(entry: z.infer<typeof modelEntrySchema>): ModelRow | null {
  const inputPerToken = parsePricePerToken(entry.pricing.prompt);
  const outputPerToken = parsePricePerToken(entry.pricing.completion);
  if (inputPerToken === null || outputPerToken === null) {
    return null;
  }

  return {
    id: entry.id,
    name: entry.name ?? entry.id,
    inputPerMillion: inputPerToken * TOKENS_PER_MILLION,
    outputPerMillion: outputPerToken * TOKENS_PER_MILLION,
    contextLength: entry.context_length ?? null,
    createdAt: toIsoDate(entry.created),
    knowledgeCutoff: entry.knowledge_cutoff ?? null,
    expirationDate: entry.expiration_date ?? null,
    structuredOutputs: entry.supported_parameters?.includes(STRUCTURED_OUTPUTS_PARAMETER) ?? false,
  };
}

export function parseModels(payload: unknown): ModelRow[] {
  const response = modelsResponseSchema.parse(payload);
  const rows: ModelRow[] = [];

  for (const candidate of response.data) {
    const entry = modelEntrySchema.safeParse(candidate);
    if (!entry.success) {
      continue;
    }
    const row = toRow(entry.data);
    if (row) {
      rows.push(row);
    }
  }

  return rows;
}

export function blendScore(row: ModelRow): number {
  return row.inputPerMillion + OUTPUT_WEIGHT_IN_BLEND * row.outputPerMillion;
}

function sortValue(row: ModelRow, sort: SortKey): number {
  if (sort === "output") {
    return row.outputPerMillion;
  }
  if (sort === "input") {
    return row.inputPerMillion;
  }
  return blendScore(row);
}

export function selectModels(rows: ModelRow[], options: ListOptions): ModelRow[] {
  const needle = options.search?.trim().toLowerCase() ?? "";

  return rows
    .filter((row) => !options.structuredOnly || row.structuredOutputs)
    .filter((row) => needle === "" || row.id.toLowerCase().includes(needle) || row.name.toLowerCase().includes(needle))
    .sort((a, b) => sortValue(a, options.sort) - sortValue(b, options.sort) || a.id.localeCompare(b.id))
    .slice(0, options.limit);
}

export function normalizeAppModelId(appModelId: string): string {
  return appModelId.replace(/^openrouter\//, "").replace(/-latest$/, "");
}

export function parseListOptions(argv: string[]): ListOptions {
  const options: ListOptions = { ...DEFAULT_LIST_OPTIONS };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--structured") {
      options.structuredOnly = true;
      continue;
    }
    if (token === "--no-structured") {
      options.structuredOnly = false;
      continue;
    }

    const [flag, inlineValue] = token.includes("=") ? token.split(/=(.*)/s) : [token, undefined];
    const readValue = (): string => {
      const value = inlineValue ?? argv[index + 1];
      if (value === undefined) {
        throw new Error(`Missing value for ${flag}`);
      }
      if (inlineValue === undefined) {
        index += 1;
      }
      return value;
    };

    if (flag === "--limit") {
      const limit = Number(readValue());
      if (!Number.isInteger(limit) || limit < 1) {
        throw new Error("--limit must be a positive integer");
      }
      options.limit = limit;
      continue;
    }
    if (flag === "--sort") {
      const sort = readValue();
      if (!(SORT_KEYS as readonly string[]).includes(sort)) {
        throw new Error(`--sort must be one of: ${SORT_KEYS.join(", ")}`);
      }
      options.sort = sort as SortKey;
      continue;
    }
    if (flag === "--search") {
      options.search = readValue();
      continue;
    }

    throw new Error(`Unknown argument: ${token}`);
  }

  return options;
}

function formatPrice(value: number): string {
  return value.toFixed(3);
}

function formatContext(contextLength: number | null): string {
  if (contextLength === null) {
    return "-";
  }
  return `${Math.round(contextLength / 1000)}k`;
}

function padEnd(value: string, width: number): string {
  return value.padEnd(width, " ");
}

export function formatModelTable(rows: ModelRow[], appModelId: string): string {
  const current = normalizeAppModelId(appModelId);
  const header = ["  ", "id", "in $/M", "out $/M", "context", "added", "cutoff", "expires"];
  const body = rows.map((row) => [
    row.id === current ? "->" : "  ",
    row.id,
    formatPrice(row.inputPerMillion),
    formatPrice(row.outputPerMillion),
    formatContext(row.contextLength),
    row.createdAt ?? "-",
    row.knowledgeCutoff ?? "-",
    row.expirationDate ?? "-",
  ]);

  const table = [header, ...body];
  const widths = header.map((_, column) => Math.max(...table.map((line) => line[column].length)));
  const render = (line: string[]) => line.map((cell, column) => padEnd(cell, widths[column])).join("  ").trimEnd();

  return table.map(render).join("\n");
}
