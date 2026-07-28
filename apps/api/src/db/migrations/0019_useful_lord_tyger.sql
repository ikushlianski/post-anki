DO $$ BEGIN
 ALTER TABLE "phrases" ADD CONSTRAINT "phrases_target_phrase_bank_entry_id_phrase_bank_entries_id_fk" FOREIGN KEY ("target_phrase_bank_entry_id") REFERENCES "public"."phrase_bank_entries"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "phrase_bank_entries_subject_level_pack_phrase_text_idx" ON "phrase_bank_entries" USING btree ("subject_id","level","pack",lower(trim("phrase_text"))) WHERE "phrase_bank_entries"."status" <> 'mastered';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "phrases_subject_level_pack_sequence_number_idx" ON "phrases" USING btree ("subject_id","level","pack","sequence_number");