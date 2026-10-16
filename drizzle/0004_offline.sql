CREATE TABLE "offline_ops" (
	"op_id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"ok" boolean NOT NULL,
	"result" jsonb,
	"error" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reserved_numbers" (
	"number" bigint PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"reserved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"used_at" timestamp with time zone,
	"order_id" uuid
);
--> statement-breakpoint
ALTER TABLE "offline_ops" ADD CONSTRAINT "offline_ops_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reserved_numbers" ADD CONSTRAINT "reserved_numbers_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "offline_ops_user_idx" ON "offline_ops" USING btree ("user_id","synced_at");--> statement-breakpoint
CREATE INDEX "reserved_numbers_user_idx" ON "reserved_numbers" USING btree ("user_id","used_at");