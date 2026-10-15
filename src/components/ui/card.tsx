import * as React from "react";
import { cn } from "@/lib/cn";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-line bg-surface shadow-card", className)} {...props} />;
}

export function CardHeader({ title, description, action, className }: {
  title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4 px-5 pt-4 pb-3", className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-ink-3">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, description, actions, back }: {
  title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; back?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {back}
        <h1 className="text-2xl font-semibold tracking-[-0.01em] text-ink">{title}</h1>
        {description && <p className="mt-1 text-[15px] text-ink-3">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon?: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-3 grid size-11 place-items-center rounded-full bg-subtle text-ink-3 [&_svg]:size-5">{icon}</div>}
      <p className="font-medium text-ink">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-ink-3">{children}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, tone, href }: {
  label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "danger" | "warning" | "success" | "brand"; href?: string;
}) {
  const toneCls = tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : tone === "success" ? "text-success" : tone === "brand" ? "text-brand" : "text-ink";
  const inner = (
    <>
      <p className="eyebrow">{label}</p>
      <p className={cn("mt-2 text-[28px] leading-none font-semibold tnum tracking-[-0.02em]", toneCls)}>{value}</p>
      {sub && <p className="mt-2 text-[13px] text-ink-3 tnum">{sub}</p>}
    </>
  );
  return href ? (
    <a href={href} className="block rounded-lg border border-line bg-surface p-5 shadow-card transition hover:border-line-2 hover:shadow-pop/40">{inner}</a>
  ) : (
    <div className="rounded-lg border border-line bg-surface p-5 shadow-card">{inner}</div>
  );
}
