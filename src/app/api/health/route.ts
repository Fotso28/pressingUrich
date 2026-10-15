import { sql } from "drizzle-orm";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}

export async function HEAD() {
  return new Response(null, { headers: { "cache-control": "no-store" } });
}
