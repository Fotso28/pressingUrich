"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "../db";
import { settings } from "../db/schema";
import { requireRole } from "../session";
import { run } from "../action-utils";

const schema = z.object({
  shopName: z.string().trim().min(2, "Nom du pressing obligatoire.").max(60),
  address: z.string().trim().max(200),
  phones: z.string().trim().max(100),
  ticketFooter: z.string().trim().max(300),
  standardDelayHours: z.number().int().min(1).max(24 * 60),
  expressDelayHours: z.number().int().min(1).max(24 * 60),
  expressRatePct: z.number().int().min(0).max(500),
  abandonedAfterDays: z.number().int().min(1).max(3650),
  agentMaxDiscountPct: z.number().int().min(0).max(100),
});

export async function updateSettings(raw: z.input<typeof schema>) {
  return run(async () => {
    await requireRole("ADMIN");
    const input = schema.parse(raw);
    await db.insert(settings).values({ id: 1, ...input })
      .onConflictDoUpdate({ target: settings.id, set: { ...input, updatedAt: new Date() } });
    revalidatePath("/", "layout");
    return undefined;
  });
}
