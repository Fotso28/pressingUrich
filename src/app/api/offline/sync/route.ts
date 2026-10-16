import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { apiSession } from "@/server/offline/auth";
import { syncBodySchema, syncOps } from "@/server/offline/sync";

export const dynamic = "force-dynamic";

/** Rejoue les opérations saisies hors ligne (dans l'ordre), renvoie le résultat de chacune. */
export async function POST(req: Request) {
  const s = await apiSession(req);
  if (!s) return NextResponse.json({ error: "Session expirée, reconnectez-vous." }, { status: 401 });
  const body = syncBodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  // Les opérations appartiennent au compte qui les a saisies : jamais rejouées sous un autre compte.
  if (body.data.userId !== s.user.id) return NextResponse.json({ error: "Opérations d'un autre compte : reconnectez-vous avec ce compte pour les envoyer." }, { status: 409 });
  const results = await syncOps(s.user, body.data.ops);
  if (results.some((r) => r.ok)) revalidatePath("/", "layout");
  return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
}
