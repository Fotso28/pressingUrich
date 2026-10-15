"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/parametres/pressing", label: "Pressing" },
  { href: "/parametres/catalogue", label: "Catalogue et tarifs" },
  { href: "/parametres/utilisateurs", label: "Utilisateurs" },
];

export function SettingsTabs() {
  const path = usePathname();
  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-line">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} className={cn("-mb-px flex h-11 items-center whitespace-nowrap border-b-2 px-3.5 text-[14.5px] font-medium",
          path === t.href ? "border-brand text-brand" : "border-transparent text-ink-3 hover:text-ink")}>{t.label}</Link>
      ))}
    </nav>
  );
}
