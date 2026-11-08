CREATE TABLE "anki_import_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"import_id" text NOT NULL,
	"note_key" text NOT NULL,
	"deck" text NOT NULL,
	"raw_text" text NOT NULL,
	"position" integer NOT NULL,
	"status" text DEFAULT 'staged' NOT NULL,
	"source_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "anki_import_notes_import_note_unique" ON "anki_import_notes" USING btree ("import_id","note_key");--> statement-breakpoint
CREATE INDEX "anki_import_notes_import_status_position_idx" ON "anki_import_notes" USING btree ("import_id","status","position");