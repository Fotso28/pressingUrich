import { pageUser } from "@/server/session";
import { PRINT_SCREEN_CSS, paperOf, ticketCss } from "@/components/print/ticket-css";
import { getSettings } from "@/server/queries/settings";

export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  await pageUser();
  const format = paperOf((await getSettings()).paperFormat);
  return (
    <>
      <style>{ticketCss(format) + PRINT_SCREEN_CSS}</style>
      {children}
    </>
  );
}
