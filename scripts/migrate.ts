import "dotenv/config";
import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { migrate as migrateNeon } from "drizzle-orm/neon-serverless/migrator";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { Pool as PgPool } from "pg";
import ws from "ws";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.warn("DATABASE_URL absent : migrations ignorées.");
    return;
  }
  if (/\.neon\.tech/.test(url)) {
    neonConfig.webSocketConstructor = ws;
    const pool = new NeonPool({ connectionString: url });
    await migrateNeon(drizzleNeon({ client: pool }), { migrationsFolder: "drizzle" });
    await pool.end();
  } else {
    const pool = new PgPool({ connectionString: url });
    await migratePg(drizzlePg({ client: pool }), { migrationsFolder: "drizzle" });
    await pool.end();
  }
  console.log("Migrations appliquées.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
