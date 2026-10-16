"use client";

import { useEffect } from "react";
import { fitPageToContent, type PaperFormat } from "./ticket-css";

/** Ajuste la longueur de page au contenu (rouleau thermique), recalculée si le contenu change. */
export function FitPage({ format }: { format: PaperFormat }) {
  useEffect(() => {
    const fit = () => fitPageToContent(format, document.body);
    fit();
    void document.fonts?.ready.then(fit);
    window.addEventListener("beforeprint", fit);
    return () => window.removeEventListener("beforeprint", fit);
  }, [format]);
  return null;
}
