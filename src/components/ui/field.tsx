"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

const control = "w-full rounded-md border border-line-2 bg-surface px-3 text-[15px] text-ink placeholder:text-ink-3/70 transition-[border-color,box-shadow] outline-none focus:border-brand focus:ring-3 focus:ring-brand/12 disabled:bg-subtle disabled:text-ink-3 aria-invalid:border-danger";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, "h-11", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, "py-2.5 min-h-20 resize-y", className)} {...props} />;
}

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cn(control, "h-11 appearance-none pr-9", className)} {...props}>{children}</select>
      <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 size-4 text-ink-3" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("block text-sm font-medium text-ink-2 mb-1.5", className)} {...props} />;
}

/** Libellé + champ : le libellé est lié au champ (id automatique) quand l'enfant est un seul élément. */
export function Field({ label, hint, error, children, className, htmlFor }: {
  label?: React.ReactNode; hint?: React.ReactNode; error?: React.ReactNode; children: React.ReactNode; className?: string; htmlFor?: string;
}) {
  const auto = React.useId();
  // On ne relie que les vrais champs (Input, Select, AmountInput…), jamais un conteneur <div>.
  const only = !htmlFor && React.Children.count(children) === 1 && React.isValidElement(children) && typeof children.type !== "string"
    ? (children as React.ReactElement<{ id?: string }>) : null;
  const id = htmlFor ?? only?.props.id ?? (only ? auto : undefined);
  const child = only && !only.props.id ? React.cloneElement(only, { id }) : children;
  return (
    <div className={className}>
      {label && <Label htmlFor={id}>{label}</Label>}
      {child}
      {error ? <p className="mt-1.5 text-sm text-danger">{error}</p> : hint ? <p className="mt-1.5 text-[13px] text-ink-3">{hint}</p> : null}
    </div>
  );
}

/** Champ montant FCFA : chiffres uniquement, séparateur de milliers à l'affichage. */
export function AmountInput({ value, onChange, className, suffix = "FCFA", ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: number | null; onChange: (v: number | null) => void; suffix?: string;
}) {
  const display = value === null || Number.isNaN(value) ? "" : value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return (
    <div className="relative">
      <input
        inputMode="numeric"
        className={cn(control, "h-11 pr-16 tnum text-right font-medium", className)}
        value={display}
        onChange={(e) => {
          const d = e.target.value.replace(/\D/g, "");
          onChange(d === "" ? null : parseInt(d.slice(0, 10), 10));
        }}
        {...props}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] font-medium text-ink-3">{suffix}</span>
    </div>
  );
}
