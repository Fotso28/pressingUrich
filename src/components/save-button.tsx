"use client";

import { Button, type ButtonProps } from "@/components/ui/button";
import { useOnline } from "@/components/shell/online";

/** Bouton d'enregistrement : désactivé hors ligne et pendant l'envoi (ENF Connectivité). */
export function SaveButton({ disabled, title, ...props }: ButtonProps) {
  const online = useOnline();
  return <Button disabled={disabled || !online} title={!online ? "Connexion perdue" : title} {...props} />;
}
