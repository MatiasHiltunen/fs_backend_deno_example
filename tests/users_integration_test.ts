import {
  deepStrictEqual as assertEquals,
  ok as assert,
} from "node:assert/strict";
import * as hegel from "@hegeldev/hegel";
import * as gs from "@hegeldev/hegel/generators";
import { createHandler } from "../src/app.ts";
import { db, listUsers } from "../src/prisma/users.ts";
import { seed } from "../src/prisma/seed.ts";

// Aja vain erillistä testikantaa vasten: deno task db:init && deno task test:integration.
Deno.test("Hegel: HTTP-sivutus vastaa PostgreSQL-käyttäjien muistissa tehtyä sivutusta", async () => {
  let server: Deno.HttpServer<Deno.NetAddr> | undefined;
  try {
    await seed();
    const rows = await db.orm.public.User
      .select("id", "email", "username", "name", "createdAt")
      .all();
    // Vertailumalli ei käytä testattavan ORM-kyselyn orderBy/limit/offset-ketjua.
    const allUsers = rows.map((user) => ({
      id: user.id,
      email: user.email,
      username: user.username,
      name: user.name,
      createdAt: user.createdAt.toISOString(),
    })).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    assert(allUsers.length >= 3, "Seed-käyttäjien pitää olla testikannassa");

    server = Deno.serve({
      hostname: "127.0.0.1",
      port: 0,
      onListen() {},
    }, createHandler(listUsers));
    const baseUrl = `http://127.0.0.1:${server.addr.port}`;

    await hegel.testAsync(async (tc) => {
      const limit = tc.draw(
        gs.integers({ minValue: 1, maxValue: 100 }),
        "limit",
      );
      const offset = tc.draw(
        gs.integers({
          minValue: 0,
          maxValue: Math.min(allUsers.length + 5, 1_000_000),
        }),
        "offset",
      );
      const response = await fetch(
        `${baseUrl}/api/users?limit=${limit}&offset=${offset}`,
      );

      assertEquals(response.status, 200);
      assertEquals(await response.json(), {
        users: allUsers.slice(offset, offset + limit),
        pagination: { limit, offset },
      });
    }, { testCases: 100, database: hegel.Database.disabled });
  } finally {
    await server?.shutdown();
    await db.close();
  }
});
