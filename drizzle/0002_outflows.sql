CREATE TYPE "public"."outflow_category" AS ENUM('INTRANTS', 'SALAIRES', 'LOYER', 'ENERGIE_EAU', 'TRANSPORT', 'ENTRETIEN', 'TAXES', 'AUTRE');--> statement-breakpoint
CREATE TYPE "public"."outflow_method" AS ENUM('ESPECES', 'MTN_MOMO', 'ORANGE_MONEY', 'BANQUE');--> statement-breakpoint
CREATE TABLE "outflows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"category" "outflow_category" NOT NULL,
	"label" text NOT NULL,
	"amount" integer NOT NULL,
	"method" "outflow_method" NOT NULL,
	"beneficiary" text,
	"salary_period" text,
	"notes" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by" text,
	"void_reason" text
);--> statement-breakpoint
CREATE INDEX "outflows_date_idx" ON "outflows" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "outflows_category_idx" ON "outflows" USING btree ("category");--> statement-breakpoint
ALTER TABLE outflows ADD CONSTRAINT outflows_amount_pos CHECK (amount > 0);
