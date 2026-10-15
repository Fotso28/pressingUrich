import "server-only";
import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool as PgPool } from "pg";
import ws from "ws";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL manquant");

// Neon en production (WebSocket, transactions interactives) ; Postgres classique en local et en CI.
const isNeon = /\.neon\.tech/.test(url);

function create() {
  if (isNeon) {
    neonConfig.webSocketConstructor = ws;
    return drizzleNeon({ client: new NeonPool({ connectionString: url }), schema });
  }
  return drizzlePg({ client: new PgPool({ connectionString: url, max: 5 }), schema }) as unknown as ReturnType<typeof drizzleNeon<typeof schema>>;
}

const g = globalThis as unknown as { __db?: ReturnType<typeof create> };
export const db = g.__db ?? create();
if (process.env.NODE_ENV !== "production") g.__db = db;

export type DB = typeof db;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export { schema };
