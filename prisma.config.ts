import { definePrismaConfig } from "prisma/config";
import { defineConfig as ormConfig } from "@prisma/orm-postgres/config";
import { databaseUrlFromEnv } from "./src/prisma/config.ts";
export default definePrismaConfig({
  orm: ormConfig({
    contract: "./src/prisma/contract.ts",
    output: "./src/prisma/generated",
    db: {
      connection: databaseUrlFromEnv(Deno.env.toObject()),
    },
  }),
});
