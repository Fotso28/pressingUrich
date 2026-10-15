import { pageAdmin } from "@/server/session";
import { listUsers } from "@/server/queries/users";
import { UsersManager } from "./manager";

export const metadata = { title: "Utilisateurs" };

export default async function Page() {
  const me = await pageAdmin();
  const users = await listUsers();
  return <UsersManager meId={me.id} users={users.map((u) => ({ id: u.id, name: u.name, username: u.username ?? "", role: u.role === "ADMIN" ? "ADMIN" : "AGENT", active: !u.banned, createdAt: u.createdAt.toISOString() }))} />;
}
