import { eq } from "drizzle-orm";
import {
  clampMaxReviewsPerDay,
  clampNewCardsPerDay,
  DEFAULT_DESIRED_RETENTION,
  DEFAULT_FUSION_ENABLED,
  DEFAULT_FUSION_MODEL_IDS,
  DEFAULT_KNOWLEDGE_ITEM_MODEL_ID,
  DEFAULT_LEARNING_STEPS_MINUTES,
  DEFAULT_MAX_REVIEWS_PER_DAY,
  DEFAULT_MIX_NEW_WITH_DUE,
  DEFAULT_NEW_CARDS_PER_DAY,
  DEFAULT_RELEARNING_STEPS_MINUTES,
  DEFAULT_TRIAGE_ENABLED,
  desiredRetentionSchema,
  fusionModelIdsSchema,
  fusionSettingsSchema,
  knowledgeItemModelIdSchema,
  stepsMinutesSchema,
  type AdminSettings,
  type KnowledgeItemModelId,
  type ModelTier,
  type StudyOptions,
  type UpdateAdminSettingsInput,
} from "@post-anki/shared";
import { getDb, type DbExecutor } from "../db/client.js";
import { appSettings } from "../db/schema.js";

export class InvalidFusionSettingsError extends Error {
  constructor(readonly issues: unknown) {
    super("invalid_fusion_settings");
  }
}

const SETTINGS_ID = "app";
const DEFAULT_MODEL_TIER: ModelTier = "cheap";

// The logger is loaded only on the fallback path: a static import would make
// every module that reaches this repo read the env at load time.
async function parseKnowledgeItemModelId(stored: string): Promise<KnowledgeItemModelId> {
  const parsed = knowledgeItemModelIdSchema.safeParse(stored);

  if (parsed.success) {
    return parsed.data;
  }

  const { log } = await import("../shared/log.js");

  log.warn({ storedModelId: stored }, "knowledge_item_model_id_unknown_fallback_default");

  return DEFAULT_KNOWLEDGE_ITEM_MODEL_ID;
}

function toStudyDefaults(row: typeof appSettings.$inferSelect): StudyOptions {
  return {
    newCardsPerDay: clampNewCardsPerDay(row.newCardsPerDay),
    maxReviewsPerDay: clampMaxReviewsPerDay(row.maxReviewsPerDay),
    learningStepsMinutes: stepsMinutesSchema.catch(DEFAULT_LEARNING_STEPS_MINUTES).parse(row.learningStepsMinutes),
    relearningStepsMinutes: stepsMinutesSchema
      .catch(DEFAULT_RELEARNING_STEPS_MINUTES)
      .parse(row.relearningStepsMinutes),
    desiredRetention: desiredRetentionSchema.catch(DEFAULT_DESIRED_RETENTION).parse(row.desiredRetention),
  };
}

const FALLBACK_STUDY_DEFAULTS: StudyOptions = {
  newCardsPerDay: DEFAULT_NEW_CARDS_PER_DAY,
  maxReviewsPerDay: DEFAULT_MAX_REVIEWS_PER_DAY,
  learningStepsMinutes: DEFAULT_LEARNING_STEPS_MINUTES,
  relearningStepsMinutes: DEFAULT_RELEARNING_STEPS_MINUTES,
  desiredRetention: DEFAULT_DESIRED_RETENTION,
};

function toFusionModelIds(stored: unknown): KnowledgeItemModelId[] {
  return fusionModelIdsSchema.catch(DEFAULT_FUSION_MODEL_IDS).parse(stored);
}

async function toAdminSettings(row: typeof appSettings.$inferSelect): Promise<AdminSettings> {
  return {
    testToggle: row.testToggle,
    modelTier: row.modelTier as ModelTier,
    knowledgeItemModelId: await parseKnowledgeItemModelId(row.knowledgeItemModelId),
    ...toStudyDefaults(row),
    maxReviewsPerDay: clampMaxReviewsPerDay(row.maxReviewsPerDay),
    mixNewWithDue: row.mixNewWithDue,
    triageEnabled: row.triageEnabled,
    fusionEnabled: row.fusionEnabled,
    fusionModelIds: toFusionModelIds(row.fusionModelIds),
  };
}

export async function getAdminSettings(): Promise<AdminSettings> {
  const existing = (
    await getDb()
      .select()
      .from(appSettings)
      .where(eq(appSettings.id, SETTINGS_ID))
  )[0];

  if (existing) {
    return await toAdminSettings(existing);
  }

  await getDb()
    .insert(appSettings)
    .values({ id: SETTINGS_ID, knowledgeItemModelId: DEFAULT_KNOWLEDGE_ITEM_MODEL_ID })
    .onConflictDoNothing();

  return {
    testToggle: false,
    modelTier: DEFAULT_MODEL_TIER,
    knowledgeItemModelId: DEFAULT_KNOWLEDGE_ITEM_MODEL_ID,
    ...FALLBACK_STUDY_DEFAULTS,
    maxReviewsPerDay: DEFAULT_MAX_REVIEWS_PER_DAY,
    mixNewWithDue: DEFAULT_MIX_NEW_WITH_DUE,
    triageEnabled: DEFAULT_TRIAGE_ENABLED,
    fusionEnabled: DEFAULT_FUSION_ENABLED,
    fusionModelIds: DEFAULT_FUSION_MODEL_IDS,
  };
}

export async function updateAdminSettings(
  input: UpdateAdminSettingsInput,
): Promise<AdminSettings> {
  const current = await getAdminSettings();
  const testToggle = input.testToggle ?? current.testToggle;
  const modelTier = input.modelTier ?? current.modelTier;
  const knowledgeItemModelId = input.knowledgeItemModelId ?? current.knowledgeItemModelId;
  const newCardsPerDay = input.newCardsPerDay ?? current.newCardsPerDay;
  const maxReviewsPerDay = input.maxReviewsPerDay ?? current.maxReviewsPerDay;
  const mixNewWithDue = input.mixNewWithDue ?? current.mixNewWithDue;
  const triageEnabled = input.triageEnabled ?? current.triageEnabled;
  const learningStepsMinutes = input.learningStepsMinutes ?? current.learningStepsMinutes;
  const relearningStepsMinutes = input.relearningStepsMinutes ?? current.relearningStepsMinutes;
  const desiredRetention = input.desiredRetention ?? current.desiredRetention;
  const fusion = fusionSettingsSchema.safeParse({
    fusionEnabled: input.fusionEnabled ?? current.fusionEnabled,
    fusionModelIds: input.fusionModelIds ?? current.fusionModelIds,
  });

  if (!fusion.success) {
    throw new InvalidFusionSettingsError(fusion.error.issues);
  }

  const { fusionEnabled, fusionModelIds } = fusion.data;

  await getDb()
    .insert(appSettings)
    .values({
      id: SETTINGS_ID,
      testToggle,
      modelTier,
      knowledgeItemModelId,
      newCardsPerDay,
      maxReviewsPerDay,
      mixNewWithDue,
      triageEnabled,
      learningStepsMinutes,
      relearningStepsMinutes,
      desiredRetention,
      fusionEnabled,
      fusionModelIds,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: appSettings.id,
      set: {
        testToggle,
        modelTier,
        knowledgeItemModelId,
        newCardsPerDay,
        maxReviewsPerDay,
        mixNewWithDue,
        triageEnabled,
        learningStepsMinutes,
        relearningStepsMinutes,
        desiredRetention,
        fusionEnabled,
        fusionModelIds,
        updatedAt: new Date(),
      },
    });

  return {
    testToggle,
    modelTier,
    knowledgeItemModelId,
    newCardsPerDay,
    maxReviewsPerDay,
    mixNewWithDue,
    triageEnabled,
    learningStepsMinutes,
    relearningStepsMinutes,
    desiredRetention,
    fusionEnabled,
    fusionModelIds,
  };
}

export async function getGlobalModelTier(): Promise<ModelTier> {
  return (await getAdminSettings()).modelTier;
}

export async function getKnowledgeItemModelId(): Promise<KnowledgeItemModelId> {
  return (await getAdminSettings()).knowledgeItemModelId;
}

export async function getNewCardsPerDay(db: DbExecutor = getDb()): Promise<number> {
  const [row] = await db
    .select({ newCardsPerDay: appSettings.newCardsPerDay })
    .from(appSettings)
    .where(eq(appSettings.id, SETTINGS_ID));

  return row ? clampNewCardsPerDay(row.newCardsPerDay) : DEFAULT_NEW_CARDS_PER_DAY;
}

export async function getMaxReviewsPerDay(db: DbExecutor = getDb()): Promise<number> {
  const [row] = await db
    .select({ maxReviewsPerDay: appSettings.maxReviewsPerDay })
    .from(appSettings)
    .where(eq(appSettings.id, SETTINGS_ID));

  return row ? clampMaxReviewsPerDay(row.maxReviewsPerDay) : DEFAULT_MAX_REVIEWS_PER_DAY;
}

export async function getMixNewWithDue(db: DbExecutor = getDb()): Promise<boolean> {
  const [row] = await db
    .select({ mixNewWithDue: appSettings.mixNewWithDue })
    .from(appSettings)
    .where(eq(appSettings.id, SETTINGS_ID));

  return row ? row.mixNewWithDue : DEFAULT_MIX_NEW_WITH_DUE;
}

export async function getStudyDefaults(db: DbExecutor = getDb()): Promise<StudyOptions> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.id, SETTINGS_ID));

  return row ? toStudyDefaults(row) : FALLBACK_STUDY_DEFAULTS;
}

export async function getTriageEnabled(db: DbExecutor = getDb()): Promise<boolean> {
  const [row] = await db
    .select({ triageEnabled: appSettings.triageEnabled })
    .from(appSettings)
    .where(eq(appSettings.id, SETTINGS_ID));

  return row ? row.triageEnabled : DEFAULT_TRIAGE_ENABLED;
}
