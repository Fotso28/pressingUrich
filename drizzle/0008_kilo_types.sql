CREATE TABLE "kilo_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"price_per_kg" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kilo_types_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "kilo_type_id" uuid;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_kilo_type_id_kilo_types_id_fk" FOREIGN KEY ("kilo_type_id") REFERENCES "public"."kilo_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
INSERT INTO "kilo_types" ("name", "price_per_kg", "sort_order") VALUES ('Linge ordinaire (couleur)', 1000, 0), ('Linge blanc', 1200, 1), ('Draps et serviettes', 1000, 2), ('Couvertures et couettes', 1500, 3);