CREATE TABLE "forfait_moves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"order_id" uuid,
	"kind" text NOT NULL,
	"grams" integer NOT NULL,
	"label" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forfaits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"price" integer NOT NULL,
	"grams" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_items" ALTER COLUMN "item_type_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ALTER COLUMN "service_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "kind" text DEFAULT 'PIECE' NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "forfait_id" uuid;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "weight_grams" integer;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "prices" ADD COLUMN "max_amount" integer;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "kilo_price" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "forfait_moves" ADD CONSTRAINT "forfait_moves_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forfait_moves" ADD CONSTRAINT "forfait_moves_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "forfait_moves_customer_idx" ON "forfait_moves" USING btree ("customer_id","created_at");--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_forfait_id_forfaits_id_fk" FOREIGN KEY ("forfait_id") REFERENCES "public"."forfaits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
INSERT INTO "forfaits" ("name", "price", "grams") VALUES ('Forfait 17 kg', 15000, 17000), ('Forfait 23 kg', 20000, 23000), ('Forfait 37 kg', 30000, 37000);