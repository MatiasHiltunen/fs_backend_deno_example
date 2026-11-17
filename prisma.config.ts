import { definePrismaConfig } from "prisma/config";
import { defineConfig as ormConfig } from "@prisma/orm-postgres/config";

const dbParams = {
  host: Deno.env.get("PGHOST") ?? "localhost",
  port: Number(Deno.env.get("PGPORT") ?? 5432),
  user: Deno.env.get("PGUSER") ?? "postgres",
  password: Deno.env.get("PGPASSWORD"),
  database: Deno.env.get("PGDATABASE") ?? "postgres",
}



export default definePrismaConfig({
  orm: ormConfig({
    contract: "./src/prisma/contract.ts",
    output: "./src/prisma/generated",
    db: {
        connection: `postgres://${dbParams.user}:${dbParams.password}@${dbParams.host}:${dbParams.port}/${dbParams.database}`
    }
  }),
});
