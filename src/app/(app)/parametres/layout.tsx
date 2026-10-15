import { pageAdmin } from "@/server/session";
import { PageHeader } from "@/components/ui/card";
import { SettingsTabs } from "./tabs";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await pageAdmin();
  return (
    <>
      <PageHeader title="Paramètres" description="Réservé au gérant." />
      <SettingsTabs />
      {children}
    </>
  );
}
