import { pageUser } from "@/server/session";

export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  await pageUser();
  return (
    <>
      <style>{`
        /* Papier par défaut : ISO B7 (88 × 125 mm), portrait. */
        @page { size: 88mm 125mm; margin: 0; }
        html, body { background: #fff !important; }
        body { margin: 0; }
        .ticket { width: 88mm; box-sizing: border-box; padding: 4mm 4mm 6mm; font: 12px/1.35 ui-monospace, "SFMono-Regular", Menlo, Consolas, "Courier New", monospace; color: #000; }
        .ticket h1 { font-size: 15px; margin: 0; text-align: center; font-weight: 700; }
        .ticket .c { text-align: center; }
        .ticket .r { display: flex; justify-content: space-between; gap: 8px; }
        .ticket .r > :last-child { text-align: right; white-space: nowrap; }
        .ticket hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
        .ticket .big { font-size: 14px; font-weight: 700; }
        .ticket .muted { font-size: 11px; }
        .label { width: 88mm; box-sizing: border-box; padding: 3mm 4mm; border-bottom: 1px dashed #000; font: 13px/1.3 ui-monospace, Menlo, Consolas, monospace; page-break-inside: avoid; }
        .label b { font-size: 16px; }
        @media screen { body { background: #e9ebef !important; padding: 16px; } .ticket, .label { background: #fff; margin: 0 auto; box-shadow: 0 1px 3px rgba(0,0,0,.15); } }
      `}</style>
      {children}
    </>
  );
}
