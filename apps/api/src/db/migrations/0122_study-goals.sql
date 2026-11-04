CREATE TABLE "add_knowledge_goals" (
	"id" text PRIMARY KEY NOT NULL,
	"subject_id" text NOT NULL,
	"period" text NOT NULL,
	"target_notes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "add_knowledge_goals_subject_id_unique" UNIQUE("subject_id")
);
--> statement-breakpoint
CREATE TABLE "study_goals" (
	"id" text PRIMARY KEY NOT NULL,
	"daily_review_target" integer
);
