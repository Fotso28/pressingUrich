import "server-only";
import { desc } from "drizzle-orm";
import { db } from "../db";
import { user } from "../db/schema";

export async function listUsers() {
  return db.select({
    id: user.id, name: user.name, username: user.username, role: user.role, banned: user.banned, createdAt: user.createdAt,
  }).from(user).orderBy(desc(user.createdAt));
}
