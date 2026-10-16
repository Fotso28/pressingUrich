/** Formats de papier des tickets : rouleaux d'imprimantes de mini-factures (thermiques) ou ISO B7. */
export type PaperFormat = "THERMAL_80" | "THERMAL_58" | "B7";
export const PAPER_FORMATS: { value: PaperFormat; label: string; hint: string }[] = [
  { value: "THERMAL_80", label: "Rouleau 80 mm", hint: "Imprimante de mini-factures (thermique) standard." },
  { value: "THERMAL_58", label: "Rouleau 58 mm", hint: "Petite imprimante thermique (mobile, Bluetooth)." },
  { value: "B7", label: "ISO B7 (88 × 125 mm)", hint: "Feuille prédécoupée, imprimante classique." },
];
const PAPER: Record<PaperFormat, { width: number; pad: string; font: number }> = {
  THERMAL_80: { width: 80, pad: "3mm 4mm 6mm", font: 12 },
  THERMAL_58: { width: 58, pad: "2mm 2mm 5mm", font: 10.5 },
  B7: { width: 88, pad: "4mm 4mm 6mm", font: 12 },
};
export const paperOf = (f: string | null | undefined): PaperFormat => (f === "THERMAL_58" || f === "B7" ? f : "THERMAL_80");

/**
 * Styles des tickets et étiquettes imprimés, partagés avec le mode hors ligne. Le format choisi dans les
 * paramètres sert de référence d'aperçu et de proportions ; le ticket s'adapte au papier réellement utilisé.
 */
export function ticketCss(format: PaperFormat): string {
  const p = PAPER[format];
  return `
    /* Pas de taille imposée : c'est le papier choisi à l'impression qui décide (rouleau, B7, A4…). */
    @page { margin: 0; }
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
    /*
     * À l'impression, le papier choisi dans la boîte de dialogue l'emporte (Android ignore @page size) :
     * le ticket occupe toute la largeur de la feuille, tailles proportionnelles à la largeur (cqw),
     * et un ticket long continue sur plusieurs pages sans couper une ligne.
     */
    @media print {
      /* La page imprimée sert de conteneur : cqw = 1 % de la largeur réellement imprimable. */
      body { container-type: inline-size; }
      .ticket, .label { width: auto; padding: ${(100 * padMm(p.pad)) / p.width}cqw ${(100 * 4) / p.width}cqw; font-size: ${fontVw(p.font, p.width)}cqw; }
      .ticket h1 { font-size: 1.25em; }
      .ticket .big { font-size: 1.17em; }
      .ticket .muted { font-size: 0.92em; }
      .ticket hr { margin: 0.5em 0; }
      .ticket img { width: 65% !important; margin-bottom: 0.6em !important; }
      .label b { font-size: 1.3em; }
      .ticket > div, .ticket .r, .label { break-inside: avoid; page-break-inside: avoid; }
    }
  `;
}

/** Taille de police en % de largeur donnant, sur un papier de la largeur de référence, la même taille qu'à l'écran. */
const fontVw = (px: number, widthMm: number) => +((px * 100) / ((widthMm * 96) / 25.4)).toFixed(3);
const padMm = (pad: string) => parseFloat(pad) || 3;

/** Aperçu à l'écran des pages /print. */
export const PRINT_SCREEN_CSS = `@media screen { body { background: #e9ebef !important; padding: 16px; } .ticket, .label { background: #fff; margin: 0 auto; box-shadow: 0 1px 3px rgba(0,0,0,.15); } }`;
