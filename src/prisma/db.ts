import postgres from "@prisma/orm-postgres/runtime";
import { contractFromJson } from "@prisma/orm-postgres/static";

import type { Contract } from "./generated/contract.d.ts";
import contractJson from "./generated/contract.json" with { type: "json" };
import { databaseUrlFromEnv } from "./config.ts";

export const contract = contractFromJson<Contract>(contractJson);

export const db = postgres({
  contract,
  url: databaseUrlFromEnv(Deno.env.toObject()),
});
