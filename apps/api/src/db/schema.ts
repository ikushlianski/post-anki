import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

export const subjects = pgTable("subjects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const curricula = pgTable("curricula", {
  id: text("id").primaryKey(),
  subjectId: text("subject_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("draft"),
  learningStatus: text("learning_status").notNull().default("not_started"),
  speed: text("speed").notNull().default("normal"),
  hinting: boolean("hinting").notNull().default(true),
  defaultDepth: text("default_depth").notNull().default("working"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sources = pgTable("sources", {
  id: text("id").primaryKey(),
  curriculumId: text("curriculum_id").notNull(),
  kind: text("kind").notNull(),
  value: text("value").notNull(),
  title: text("title"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const modules = pgTable("modules", {
  id: text("id").primaryKey(),
  curriculumId: text("curriculum_id").notNull(),
  title: text("title").notNull(),
  order: integer("order").notNull(),
  learningStatus: text("learning_status").notNull().default("not_started"),
});

export const topics = pgTable("topics", {
  id: text("id").primaryKey(),
  moduleId: text("module_id").notNull(),
  curriculumId: text("curriculum_id").notNull(),
  title: text("title").notNull(),
  summary: text("summary"),
  order: integer("order").notNull(),
  included: boolean("included").notNull().default(true),
  selfGrade: integer("self_grade"),
  depth: text("depth").notNull().default("working"),
  learningStatus: text("learning_status").notNull().default("not_started"),
  progressStatus: text("progress_status").notNull().default("not_started"),
  progressMaturity: integer("progress_maturity").notNull().default(0),
  progressAttempts: integer("progress_attempts").notNull().default(0),
  progressLastInteractedAt: timestamp("progress_last_interacted_at", {
    withTimezone: true,
  }),
});

export const gaps = pgTable("gaps", {
  id: text("id").primaryKey(),
  topicId: text("topic_id").notNull(),
  label: text("label").notNull(),
  depth: text("depth").notNull().default("working"),
  origin: text("origin").notNull().default("ai"),
  state: text("state").notNull().default("open"),
  wanted: boolean("wanted").notNull().default(false),
  concern: text("concern"),
  lastEvaluatedAt: timestamp("last_evaluated_at", { withTimezone: true }),
});
