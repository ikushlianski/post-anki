CREATE TABLE IF NOT EXISTS "curricula" (
	"id" text PRIMARY KEY NOT NULL,
	"subject_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"learning_status" text DEFAULT 'not_started' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gaps" (
	"id" text PRIMARY KEY NOT NULL,
	"topic_id" text NOT NULL,
	"label" text NOT NULL,
	"depth" text DEFAULT 'working' NOT NULL,
	"origin" text DEFAULT 'ai' NOT NULL,
	"state" text DEFAULT 'open' NOT NULL,
	"wanted" boolean DEFAULT false NOT NULL,
	"concern" text,
	"last_evaluated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "modules" (
	"id" text PRIMARY KEY NOT NULL,
	"curriculum_id" text NOT NULL,
	"title" text NOT NULL,
	"order" integer NOT NULL,
	"learning_status" text DEFAULT 'not_started' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sources" (
	"id" text PRIMARY KEY NOT NULL,
	"curriculum_id" text NOT NULL,
	"kind" text NOT NULL,
	"value" text NOT NULL,
	"title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subjects" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "topics" (
	"id" text PRIMARY KEY NOT NULL,
	"module_id" text NOT NULL,
	"curriculum_id" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"order" integer NOT NULL,
	"included" boolean DEFAULT true NOT NULL,
	"self_grade" integer,
	"depth" text DEFAULT 'working' NOT NULL,
	"learning_status" text DEFAULT 'not_started' NOT NULL,
	"progress_status" text DEFAULT 'not_started' NOT NULL,
	"progress_maturity" integer DEFAULT 0 NOT NULL,
	"progress_attempts" integer DEFAULT 0 NOT NULL,
	"progress_last_interacted_at" timestamp with time zone
);
