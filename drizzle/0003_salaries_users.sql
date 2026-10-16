ALTER TYPE "public"."outflow_category" ADD VALUE IF NOT EXISTS 'ELECTRICITE';--> statement-breakpoint
ALTER TYPE "public"."outflow_category" ADD VALUE IF NOT EXISTS 'EAU';--> statement-breakpoint
ALTER TYPE "public"."outflow_category" ADD VALUE IF NOT EXISTS 'ABONNEMENTS';--> statement-breakpoint
CREATE TABLE "app_meta" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "outflows" ADD COLUMN "beneficiary_user_id" text;--> statement-breakpoint
ALTER TABLE "outflows" ADD CONSTRAINT "outflows_beneficiary_user_id_user_id_fk" FOREIGN KEY ("beneficiary_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outflows_beneficiary_user_idx" ON "outflows" USING btree ("beneficiary_user_id");--> statement-breakpoint
UPDATE "outflows" o SET "beneficiary_user_id" = u."id" FROM "user" u WHERE o."category" = 'SALAIRES' AND o."beneficiary" = u."name";
