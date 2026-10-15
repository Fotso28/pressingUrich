import { AppShell } from "@/components/shell/app-shell";
import { pageUser } from "@/server/session";
import { getSettings } from "@/server/queries/settings";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, settings] = await Promise.all([pageUser(), getSettings()]);
  return <AppShell user={{ name: user.name, username: user.username, role: user.role }} shopName={settings.shopName}>{children}</AppShell>;
}
