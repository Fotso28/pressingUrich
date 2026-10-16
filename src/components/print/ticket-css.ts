/** Formats de papier des tickets : rouleaux d'imprimantes de mini-factures (thermiques) ou ISO B7. */
export type PaperFormat = "THERMAL_80" | "THERMAL_58" | "B7";
export const PAPER_FORMATS: { value: PaperFormat; label: string; hint: string }[] = [
  { value: "THERMAL_80", label: "Rouleau 80 mm", hint: "Imprimante de mini-factures (thermique) standard. Longueur ajustée au contenu." },
  { value: "THERMAL_58", label: "Rouleau 58 mm", hint: "Petite imprimante thermique (mobile, Bluetooth)." },
  { value: "B7", label: "ISO B7 (88 × 125 mm)", hint: "Feuille prédécoupée, imprimante classique." },
];
const PAPER: Record<PaperFormat, { width: number; height: number | null; pad: string; font: number }> = {
  THERMAL_80: { width: 80, height: null, pad: "3mm 4mm 6mm", font: 12 },
  THERMAL_58: { width: 58, height: null, pad: "2mm 2mm 5mm", font: 10.5 },
  B7: { width: 88, height: 125, pad: "4mm 4mm 6mm", font: 12 },
};
export const paperOf = (f: string | null | undefined): PaperFormat => (f === "THERMAL_58" || f === "B7" ? f : "THERMAL_80");

/**
 * Styles des tickets et étiquettes imprimés, partagés avec le mode hors ligne. Sur rouleau, la hauteur
 * de page est recalculée d'après le contenu juste avant l'impression (voir fitPageToContent).
 */
export function ticketCss(format: PaperFormat): string {
  const p = PAPER[format];
  return `
    @page { size: ${p.width}mm ${p.height ?? 297}mm; margin: 0; }
    html, body { background: #fff !important; }
    body { margin: 0; }
    .ticket { width: ${p.width}mm; box-sizing: border-box; padding: ${p.pad}; font: ${p.font}px/1.35 ui-monospace, "SFMono-Regular", Menlo, Consolas, "Courier New", monospace; color: #000; }
    .ticket h1 { font-size: ${p.font + 3}px; margin: 0; text-align: center; font-weight: 700; }
    .ticket .c { text-align: center; }
    .ticket .r { display: flex; justify-content: space-between; gap: 8px; }
    .ticket .r > :last-child { text-align: right; white-space: nowrap; }
    .ticket hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
    .ticket .big { font-size: ${p.font + 2}px; font-weight: 700; }
    .ticket .muted { font-size: ${p.font - 1}px; }
    .label { width: ${p.width}mm; box-sizing: border-box; padding: 3mm ${format === "THERMAL_58" ? 2 : 4}mm; border-bottom: 1px dashed #000; font: ${p.font + 1}px/1.3 ui-monospace, Menlo, Consolas, monospace; page-break-inside: avoid; }
    .label b { font-size: ${p.font + 4}px; }
  `;
}

/** Rouleau thermique : une seule page, aussi longue que le contenu (pas de coupure ni de papier gâché). */
export function fitPageToContent(format: PaperFormat, el: HTMLElement) {
  const p = PAPER[format];
  if (p.height) return;
  const mm = Math.ceil((el.scrollHeight * 25.4) / 96) + 4;
  // Ajoutée en fin de page, donc après la règle de base : c'est elle qui s'applique.
  let tag = el.ownerDocument.getElementById("cp-fit-page");
  if (!tag) { tag = el.ownerDocument.createElement("style"); tag.id = "cp-fit-page"; el.ownerDocument.body.appendChild(tag); }
  tag.textContent = `@page { size: ${p.width}mm ${mm}mm; margin: 0; }`;
}

/** Aperçu à l'écran des pages /print. */
export const PRINT_SCREEN_CSS = `@media screen { body { background: #e9ebef !important; padding: 16px; } .ticket, .label { background: #fff; margin: 0 auto; box-shadow: 0 1px 3px rgba(0,0,0,.15); } }`;
