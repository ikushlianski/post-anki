import { and, asc, eq, inArray, ne } from "drizzle-orm";
import {
  DEFAULT_KNOWLEDGE_ITEM_MODEL_ID,
  knowledgeItemModelIdSchema,
  type KnowledgeItemModelId,
} from "@post-anki/shared";
import { getDb } from "../../src/db/client.ts";
import {
  appSettings,
  knowledgeBitQuestionVariants,
  knowledgeBits,
  knowledgeSources,
  subjects,
} from "../../src/db/schema.ts";

export const MAX_WORDS = 1500;

export interface ExistingBit {
  statement: string;
  variants: { kind: string; prompt: string; answer: string }[];
}

export interface EvalSource {
  id: string;
  subjectId: string | null;
  subjectPath: string;
  inBusiness: boolean;
  url: string | null;
  totalWords: number;
  text: string;
  bits: ExistingBit[];
}

export async function readConfiguredModelId(): Promise<KnowledgeItemModelId> {
  const [row] = await getDb().select({ id: appSettings.knowledgeItemModelId }).from(appSettings).limit(1);
  const parsed = knowledgeItemModelIdSchema.safeParse(row?.id);

  return parsed.success ? parsed.data : DEFAULT_KNOWLEDGE_ITEM_MODEL_ID;
}

function cutWords(text: string): { text: string; total: number } {
  const words = text.trim().split(/\s+/);

  return { text: words.slice(0, MAX_WORDS).join(" "), total: words.length };
}

async function loadBits(sourceId: string): Promise<ExistingBit[]> {
  const db = getDb();
  const bits = await db
    .select({ id: knowledgeBits.id, body: knowledgeBits.body })
    .from(knowledgeBits)
    .where(eq(knowledgeBits.knowledgeSourceId, sourceId))
    .orderBy(asc(knowledgeBits.ordinal));

  if (bits.length === 0) {
    return [];
  }

  const variants = await db
    .select()
    .from(knowledgeBitQuestionVariants)
    .where(inArray(knowledgeBitQuestionVariants.knowledgeBitId, bits.map((bit) => bit.id)))
    .orderBy(asc(knowledgeBitQuestionVariants.kind), asc(knowledgeBitQuestionVariants.order));

  return bits.map((bit) => ({
    statement: bit.body,
    variants: variants
      .filter((variant) => variant.knowledgeBitId === bit.id && variant.supersededAt === null)
      .map(({ kind, prompt, answer }) => ({ kind, prompt, answer })),
  }));
}

export async function loadSources(): Promise<EvalSource[]> {
  const db = getDb();
  const allSubjects = await db.select({ id: subjects.id, name: subjects.name, parentId: subjects.parentId }).from(subjects);
  const byId = new Map(allSubjects.map((subject) => [subject.id, subject]));

  const pathOf = (subjectId: string | null): string[] => {
    const names: string[] = [];
    let current = subjectId ? byId.get(subjectId) : undefined;

    while (current) {
      names.unshift(current.name);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }

    return names;
  };

  const rows = await db
    .select()
    .from(knowledgeSources)
    .orderBy(asc(knowledgeSources.createdAt));
  const result: EvalSource[] = [];

  for (const row of rows) {
    if (!row.rawText || row.rawText.trim() === "") {
      continue;
    }

    const path = pathOf(row.subjectId);
    const cut = cutWords(row.rawText);

    result.push({
      id: row.id,
      subjectId: row.subjectId,
      subjectPath: path.length > 0 ? path.join(" > ") : "(unfiled)",
      inBusiness: path[0] === "Business",
      url: row.sourceUrl,
      totalWords: cut.total,
      text: cut.text,
      bits: await loadBits(row.id),
    });
  }

  return result;
}

export function pickSources(all: readonly EvalSource[]): EvalSource[] {
  const business = all.filter((source) => source.inBusiness).slice(0, 6);
  const others = all.filter((source) => !source.inBusiness);

  return [...business, ...others.slice(0, 2)];
}

export async function loadKnownFronts(source: EvalSource, limit = 20): Promise<string[]> {
  if (!source.subjectId) {
    return [];
  }

  const db = getDb();
  const rows = await db
    .select({ prompt: knowledgeBitQuestionVariants.prompt })
    .from(knowledgeBitQuestionVariants)
    .innerJoin(knowledgeBits, eq(knowledgeBits.id, knowledgeBitQuestionVariants.knowledgeBitId))
    .innerJoin(knowledgeSources, eq(knowledgeSources.id, knowledgeBits.knowledgeSourceId))
    .where(and(eq(knowledgeSources.subjectId, source.subjectId), ne(knowledgeSources.id, source.id)))
    .limit(limit);

  return rows.map((row) => row.prompt);
}
