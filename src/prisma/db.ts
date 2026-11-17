import postgres from "@prisma/orm-postgres/runtime";
import { contractFromJson } from "@prisma/orm-postgres/static";

import type { Contract } from "./generated/contract.d.ts";
import contractJson from "./generated/contract.json" with { type: "json" };

export const contract = contractFromJson<Contract>(contractJson);

const dbParams = {
  host: Deno.env.get("PGHOST"),
  port: Number(Deno.env.get("PGPORT")),
  user: Deno.env.get("PGUSER"),
  password: Deno.env.get("PGPASSWORD"),
  database: Deno.env.get("PGDATABASE"),
  getUrl: ()=> {
    for (const [key, value] of Object.entries(dbParams)) {
      if (value == null) {
        throw new Error(`Missing database parameter: ${key}`);
      }
    }
    return `postgres://${dbParams.user}:${dbParams.password}@${dbParams.host}:${dbParams.port}/${dbParams.database}`;
  }
};


export const db = postgres({ contract, url: dbParams.getUrl() });
