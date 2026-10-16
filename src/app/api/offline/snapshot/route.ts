import { NextResponse } from "next/server";
import { apiSession } from "@/server/offline/auth";
import { buildSnapshot } from "@/server/offline/snapshot";

export const dynamic = "force-dynamic";

/** Copie locale pour le mode hors ligne : catalogue, clients, commandes en cours, caisse, numéros réservés. */
export async function GET(req: Request) {
  const s = await apiSession(req);
  if (!s) return NextResponse.json({ error: "Session expirée, reconnectez-vous." }, { status: 401 });
  return NextResponse.json(await buildSnapshot(s.user, s.expiresAt), { headers: { "Cache-Control": "no-store" } });
}
