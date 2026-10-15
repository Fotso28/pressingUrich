import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Redirection rapide vers /login sans cookie de session. Le vrai contrôle d'accès
// est fait dans chaque page (pageUser) et chaque Server Action (requireUser / requireRole).
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    const url = new URL("/login", request.url);
    const from = request.nextUrl.pathname + request.nextUrl.search;
    if (from !== "/") url.searchParams.set("from", from);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Exclut la connexion, l'API, les fichiers Next et tout fichier statique (extension) : logo, icônes, sw.js…
  matcher: ["/((?!login|api|_next|manifest.webmanifest|.*\\.[a-zA-Z0-9]+$).*)"],
};
