ALTER TABLE "user" ADD COLUMN "monthly_salary" integer;--> statement-breakpoint
UPDATE "user" u SET "monthly_salary" = x."amount"
FROM (
  SELECT DISTINCT ON ("beneficiary_user_id") "beneficiary_user_id", "amount" FROM "outflows"
  WHERE "category" = 'SALAIRES' AND "voided_at" IS NULL AND "beneficiary_user_id" IS NOT NULL
  ORDER BY "beneficiary_user_id", "occurred_at" DESC
) x
WHERE x."beneficiary_user_id" = u."id" AND u."monthly_salary" IS NULL;
