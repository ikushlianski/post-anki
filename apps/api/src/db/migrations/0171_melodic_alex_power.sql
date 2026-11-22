CREATE TABLE "subject_day_skips" (
	"subject_id" text NOT NULL,
	"day_key" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subject_day_skips_subject_id_day_key_pk" PRIMARY KEY("subject_id","day_key")
);
--> statement-breakpoint
ALTER TABLE "subject_day_skips" ADD CONSTRAINT "subject_day_skips_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;