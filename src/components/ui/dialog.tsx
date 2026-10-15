"use client";

import * as React from "react";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({ title, description, children, className, wide }: {
  title: React.ReactNode; description?: React.ReactNode; children: React.ReactNode; className?: string; wide?: boolean;
}) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-ink/35 backdrop-blur-[2px] data-[state=open]:animate-[fade-in_150ms_ease-out]" />
      <D.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-[calc(100vw-24px)] max-h-[calc(100dvh-24px)] overflow-y-auto -translate-x-1/2 -translate-y-1/2 rounded-xl bg-surface shadow-pop outline-none data-[state=open]:animate-[pop-in_160ms_ease-out]",
          wide ? "max-w-2xl" : "max-w-md",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <D.Title className="text-base font-semibold text-ink">{title}</D.Title>
            {description ? <D.Description className="mt-0.5 text-sm text-ink-3">{description}</D.Description> : <D.Description className="sr-only">{typeof title === "string" ? title : ""}</D.Description>}
          </div>
          <D.Close className="-mr-1 grid size-8 place-items-center rounded-md text-ink-3 hover:bg-subtle hover:text-ink" aria-label="Fermer">
            <X className="size-4" />
          </D.Close>
        </div>
        <div className="px-5 py-4">{children}</div>
      </D.Content>
    </D.Portal>
  );
}

export function DialogFooter({ children }: { children: React.ReactNode }) {
  return <div className="-mx-5 -mb-4 mt-5 flex flex-col-reverse gap-2 border-t border-line bg-canvas/60 px-5 py-3 sm:flex-row sm:justify-end">{children}</div>;
}
