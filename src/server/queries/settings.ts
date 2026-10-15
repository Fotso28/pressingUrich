import "server-only";
import { cache } from "react";
import { db } from "../db";
import { settings } from "../db/schema";

export type Settings = typeof settings.$inferSelect;

const DEFAULTS: Settings = {
  id: 1, shopName: "Continental Pressing", address: "", phones: "", ticketFooter: "",
  standardDelayHours: 48, expressDelayHours: 24, expressRatePct: 50, abandonedAfterDays: 30, agentMaxDiscountPct: 10,
  createdAt: new Date(0), updatedAt: new Date(0),
};

export const getSettings = cache(async (): Promise<Settings> => {
  const [s] = await db.select().from(settings).limit(1);
  return s ?? DEFAULTS;
});
