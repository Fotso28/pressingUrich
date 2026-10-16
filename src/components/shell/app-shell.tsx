"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Home, PackagePlus, ClipboardList, Users, Wallet, BarChart3, Settings2, LogOut, Plus, ReceiptText, Menu, X, Banknote,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { authClient } from "@/lib/auth-client";
import { OnlineProvider, useOnline } from "./online";
import { GlobalSearch } from "./global-search";

type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }>; admin?: boolean; match?: (p: string) => boolean };

const NAV: NavItem[] = [
  { href: "/", label: "Accueil", icon: Home, match: (p) => p === "/" },
  { href: "/depot/nouveau", label: "Nouveau dépôt", icon: PackagePlus, match: (p) => p.startsWith("/depot") },
  { href: "/commandes", label: "Commandes", icon: ClipboardList },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/caisse", label: "Caisse", icon: Wallet },
  { href: "/encaissements", label: "Encaissements", icon: Banknote },
  { href: "/depenses", label: "Dépenses", icon: ReceiptText, admin: true },
  { href: "/rapports", label: "Rapports", icon: BarChart3, admin: true },
  { href: "/parametres/pressing", label: "Paramètres", icon: Settings2, admin: true, match: (p) => p.startsWith("/parametres") },
];

const MOBILE: NavItem[] = [NAV[0], NAV[1], NAV[2], NAV[4]];

function isActive(item: NavItem, path: string) {
  return item.match ? item.match(path) : path === item.href || path.startsWith(item.href + "/");
}

export interface ShellUser { name: string; username: string | null; role: "ADMIN" | "AGENT" }

export function AppShell({ user, shopName, children }: { user: ShellUser; shopName: string; children: React.ReactNode }) {
  return (
    <OnlineProvider>
      <ShellInner user={user} shopName={shopName}>{children}</ShellInner>
    </OnlineProvider>
  );
}

function ShellInner({ user, shopName, children }: { user: ShellUser; shopName: string; children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const online = useOnline();
  const [loggingOut, setLoggingOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Ferme le menu mobile à chaque changement de page.
  const [menuPath, setMenuPath] = useState(path);
  if (menuPath !== path) { setMenuPath(path); setMenuOpen(false); }
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);
  const items = NAV.filter((n) => !n.admin || user.role === "ADMIN");

  async function logout() {
    setLoggingOut(true);
    await authClient.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="min-h-dvh overflow-x-clip lg:pl-60">
      {/* Barre latérale (PC, tablette paysage) */}
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface lg:flex">
        <Link href="/" className="flex h-[76px] items-center px-5" aria-label={shopName}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt={shopName} width={176} height={68} className="h-auto w-[168px]" />
        </Link>
        <nav className="flex-1 space-y-0.5 px-3 py-2">
          {items.map((item) => {
            const active = isActive(item, path);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href}
                className={cn("flex h-10 items-center gap-3 rounded-md px-3 text-[14.5px] font-medium transition-colors",
                  active ? "bg-brand-50 text-brand" : "text-ink-2 hover:bg-subtle hover:text-ink")}>
                <Icon className={cn("size-[18px]", active ? "text-brand" : "text-ink-3")} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-line p-3">
          <div className="flex items-center gap-3 rounded-md px-2 py-2">
            <span className="grid size-9 place-items-center rounded-full bg-subtle text-sm font-semibold text-ink-2">{user.name.slice(0, 1).toUpperCase()}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user.name}</p>
              <p className="text-[12.5px] text-ink-3">{user.role === "ADMIN" ? "Gérant" : "Agent comptoir"}</p>
            </div>
            <button onClick={logout} disabled={loggingOut} className="grid size-9 place-items-center rounded-md text-ink-3 hover:bg-subtle hover:text-ink" aria-label="Se déconnecter" title="Se déconnecter">
              <LogOut className="size-[18px]" />
            </button>
          </div>
        </div>
      </aside>

      {/* Barre supérieure */}
      <header className="no-print sticky top-0 z-20 border-b border-line bg-surface/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-3 px-4 sm:px-6">
          <Link href="/" className="flex shrink-0 items-center lg:hidden" aria-label={shopName}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt={shopName} width={92} height={36} className="h-8 w-auto" />
          </Link>
          <GlobalSearch />
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <span className={cn("hidden items-center gap-2 rounded-full px-3 py-1 text-[13px] font-medium sm:inline-flex",
              online ? "bg-success-50 text-[#12813c]" : "bg-danger-50 text-danger")}>
              <span className={cn("size-2 rounded-full", online ? "bg-success" : "bg-danger")} />
              {online ? "En ligne" : "Hors ligne"}
            </span>
            <button onClick={logout} className="grid size-10 place-items-center rounded-md text-ink-3 hover:bg-subtle lg:hidden" aria-label="Se déconnecter">
              <LogOut className="size-[18px]" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 pb-28 pt-6 sm:px-6 lg:pb-12 lg:pt-8">{children}</main>

      {/* Bouton flottant + barre inférieure (téléphone) */}
      {!path.startsWith("/depot") && !menuOpen && (
        <Link href="/depot/nouveau" className="no-print fixed bottom-[84px] right-4 z-30 flex h-14 items-center gap-2 rounded-full bg-brand pl-4 pr-5 font-medium text-white shadow-pop lg:hidden">
          <Plus className="size-5" /> Dépôt
        </Link>
      )}
      <nav className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
        {MOBILE.map((item) => {
          const active = !menuOpen && isActive(item, path);
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className={cn("flex h-16 flex-col items-center justify-center gap-1 text-[11.5px] font-medium", active ? "text-brand" : "text-ink-3")}>
              <Icon className="size-[22px]" />
              {item.label === "Nouveau dépôt" ? "Dépôt" : item.label}
            </Link>
          );
        })}
        <button type="button" onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen} aria-controls="mobile-menu"
          className={cn("flex h-16 flex-col items-center justify-center gap-1 text-[11.5px] font-medium", menuOpen || !MOBILE.some((i) => isActive(i, path)) ? "text-brand" : "text-ink-3")}>
          {menuOpen ? <X className="size-[22px]" /> : <Menu className="size-[22px]" />}
          Menu
        </button>
      </nav>

      {/* Menu complet (téléphone) */}
      {menuOpen && (
        <div className="no-print fixed inset-0 z-20 lg:hidden">
          <button type="button" aria-label="Fermer le menu" className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]" onClick={() => setMenuOpen(false)} />
          <div id="mobile-menu" role="dialog" aria-modal="true" aria-label="Menu"
            className="absolute inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] max-h-[75dvh] overflow-y-auto rounded-t-2xl border-t border-line bg-surface p-3 shadow-pop">
            <div className="flex items-center gap-3 px-2 pb-3 pt-1">
              <span className="grid size-10 place-items-center rounded-full bg-brand-50 text-[15px] font-semibold text-brand">{user.name.slice(0, 1).toUpperCase()}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{user.name}</p>
                <p className="text-[13px] text-ink-3">{user.role === "ADMIN" ? "Gérant" : "Agent comptoir"} · {online ? "En ligne" : "Hors ligne"}</p>
              </div>
            </div>
            <nav className="grid grid-cols-2 gap-2 border-t border-line pt-3">
              {items.map((item) => {
                const active = isActive(item, path);
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)}
                    className={cn("flex h-14 items-center gap-3 rounded-lg border px-3 text-[15px] font-medium",
                      active ? "border-brand/30 bg-brand-50 text-brand" : "border-line text-ink-2 active:bg-subtle")}>
                    <Icon className={cn("size-5", active ? "text-brand" : "text-ink-3")} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <button type="button" onClick={logout} disabled={loggingOut}
              className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-line text-[15px] font-medium text-danger active:bg-danger-50">
              <LogOut className="size-[18px]" /> Se déconnecter
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
