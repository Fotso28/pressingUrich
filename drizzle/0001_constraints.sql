ALTER TABLE prices      ADD CONSTRAINT prices_amount_pos    CHECK (amount >= 0);--> statement-breakpoint
ALTER TABLE order_items ADD CONSTRAINT items_qty_pos        CHECK (quantity > 0);--> statement-breakpoint
ALTER TABLE payments    ADD CONSTRAINT payments_amount_pos  CHECK (amount > 0);--> statement-breakpoint
ALTER TABLE expenses    ADD CONSTRAINT expenses_amount_pos  CHECK (amount > 0);--> statement-breakpoint
ALTER TABLE orders      ADD CONSTRAINT orders_paid_le_total CHECK (amount_paid <= total);--> statement-breakpoint
ALTER TABLE orders      ADD CONSTRAINT orders_total_pos     CHECK (total >= 0);--> statement-breakpoint
ALTER TABLE orders      ADD CONSTRAINT orders_paid_pos      CHECK (amount_paid >= 0);--> statement-breakpoint
ALTER TABLE settings    ADD CONSTRAINT settings_single_row  CHECK (id = 1);
