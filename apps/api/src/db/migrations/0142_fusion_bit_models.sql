CREATE TABLE "knowledge_bit_fusion_models" (
	"bit_id" text NOT NULL,
	"model_id" text NOT NULL,
	CONSTRAINT "knowledge_bit_fusion_models_bit_id_model_id_pk" PRIMARY KEY("bit_id","model_id")
);
--> statement-breakpoint
ALTER TABLE "knowledge_bit_fusion_models" ADD CONSTRAINT "knowledge_bit_fusion_models_bit_id_knowledge_bits_id_fk" FOREIGN KEY ("bit_id") REFERENCES "public"."knowledge_bits"("id") ON DELETE cascade ON UPDATE no action;