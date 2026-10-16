import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import { waLink } from "@/lib/domain/whatsapp";

/** Ouvre WhatsApp vers le client avec un message prérempli (wa.me). */
export function WhatsAppButton({ phone, text, label = "WhatsApp", size = "md", className }: { phone: string; text: string; label?: string; size?: "md" | "lg" | "icon"; className?: string }) {
  return (
    <a href={waLink(phone, text)} target="_blank" rel="noopener noreferrer" aria-label={size === "icon" ? label : undefined} title={label}
      className={cn("inline-flex items-center justify-center gap-2 rounded-md bg-[#25D366] font-medium text-white transition hover:bg-[#1ebe5b] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#25D366]/30",
        size === "icon" ? "size-9" : size === "lg" ? "h-12 px-5 text-[15px]" : "h-10 px-4 text-sm", className)}>
      <MessageCircle className="size-[18px]" />{size !== "icon" && label}
    </a>
  );
}
