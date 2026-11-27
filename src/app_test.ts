import { deepStrictEqual as assertEquals } from "node:assert/strict";
import * as hegel from "@hegeldev/hegel";
import * as gs from "@hegeldev/hegel/generators";
import { createHandler } from "./app.ts";
import {
  MAX_USER_LIMIT,
  MAX_USER_OFFSET,
  type UserListOptions,
} from "./pagination.ts";

const propertySettings = { testCases: 100, database: hegel.Database.disabled };

Deno.test("Hegel: sivutus ja käyttäjät välittyvät muuttumattomina", async () => {
  await hegel.testAsync(async (tc) => {
    const limit = tc.draw(
      gs.integers({ minValue: 1, maxValue: MAX_USER_LIMIT }),
    );
    const offset = tc.draw(
      gs.integers({ minValue: 0, maxValue: MAX_USER_OFFSET }),
    );
    const users = tc.draw(
      gs.arrays(gs.text({ maxSize: 30 }), { maxSize: limit }),
      "names",
    ).map((name, index) => ({ id: String(index), name }));
    const calls: UserListOptions[] = [];
    const handler = createHandler((options) => {
      calls.push(options);
      return Promise.resolve(users);
    });
    const query = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });

    const response = await handler(
      new Request(`http://localhost/api/users?${query}`),
    );

    assertEquals(response.status, 200);
    assertEquals(response.headers.get("content-type"), "application/json");
    assertEquals(calls, [{ limit, offset }]);
    assertEquals(await response.json(), {
      users,
      pagination: { limit, offset },
    });
  }, propertySettings);
});

Deno.test("Hegel: virheellinen sivutus ei kutsu tietokantaa", async () => {
  await hegel.testAsync(async (tc) => {
    const parameter = tc.draw(gs.sampledFrom(["limit", "offset"]));
    const invalidValue = tc.draw(gs.oneOf(
      gs.integers({ minValue: -1_000_000, maxValue: -1 }).map(String),
      gs.integers({
        minValue: MAX_USER_OFFSET + 1,
        maxValue: Number.MAX_SAFE_INTEGER,
      }).map(String),
      gs.text({ maxSize: 30 }).map((suffix) => `1x${suffix}`),
    ));
    let calls = 0;
    const handler = createHandler(() => {
      calls++;
      return Promise.resolve([]);
    });
    const query = new URLSearchParams({ [parameter]: invalidValue });

    const response = await handler(
      new Request(`http://localhost/api/users?${query}`),
    );

    assertEquals(response.status, 400);
    assertEquals(calls, 0);
    assertEquals(typeof (await response.json()).error, "string");
  }, propertySettings);
});

Deno.test("Hegel: toistuva sivutusparametri hylätään myös arvojen ollessa samoja", async () => {
  await hegel.testAsync(async (tc) => {
    const parameter = tc.draw(gs.sampledFrom(["limit", "offset"]));
    const first = tc.draw(
      gs.integers({ minValue: 1, maxValue: MAX_USER_LIMIT }),
    );
    const second = tc.draw(
      gs.integers({ minValue: 1, maxValue: MAX_USER_LIMIT }),
    );
    let calls = 0;
    const handler = createHandler(() => {
      calls++;
      return Promise.resolve([]);
    });
    const query = new URLSearchParams([
      [parameter, String(first)],
      [parameter, String(second)],
    ]);

    const response = await handler(
      new Request(`http://localhost/api/users?${query}`),
    );

    assertEquals(response.status, 400);
    assertEquals(calls, 0);
    await response.body?.cancel();
  }, propertySettings);
});

Deno.test("käyttäjälistan oletusarvot toimivat myös juuripolussa", async () => {
  for (const path of ["/", "/api/users"]) {
    const calls: UserListOptions[] = [];
    const handler = createHandler((options) => {
      calls.push(options);
      return Promise.resolve([]);
    });

    const response = await handler(new Request(`http://localhost${path}`));

    assertEquals(response.status, 200);
    assertEquals(calls, [{ limit: 10, offset: 0 }]);
    assertEquals(await response.json(), {
      users: [],
      pagination: { limit: 10, offset: 0 },
    });
  }
});

Deno.test("sivutuksen raja-arvot ja virheelliset numeromuodot tarkistetaan", async () => {
  for (
    const [parameter, value] of [
      ["limit", "0"],
      ["limit", "101"],
      ["offset", "1000001"],
      ...["", "1.5", "1e2", "0x10", " 2", "+2", "02", "NaN", "Infinity"]
        .flatMap((value) => [["limit", value], ["offset", value]]),
    ]
  ) {
    let calls = 0;
    const handler = createHandler(() => {
      calls++;
      return Promise.resolve([]);
    });
    const query = new URLSearchParams({ [parameter]: value });

    const response = await handler(
      new Request(`http://localhost/api/users?${query}`),
    );

    assertEquals(response.status, 400, `${parameter}=${value}`);
    assertEquals(calls, 0);
    await response.body?.cancel();
  }
});

Deno.test("tuntematon polku ja väärä HTTP-metodi eivät kutsu tietokantaa", async () => {
  let calls = 0;
  const handler = createHandler(() => {
    calls++;
    return Promise.resolve([]);
  });

  const missing = await handler(new Request("http://localhost/missing"));
  assertEquals(missing.status, 404);
  await missing.body?.cancel();

  for (const method of ["POST", "PUT", "DELETE", "HEAD"]) {
    const response = await handler(
      new Request("http://localhost/api/users", { method }),
    );
    assertEquals(response.status, 405);
    assertEquals(response.headers.get("allow"), "GET");
    await response.body?.cancel();
  }
  assertEquals(calls, 0);
});

Deno.test("tietokantavirheen yksityiskohdat eivät päädy HTTP-vastaukseen", async () => {
  const handler = createHandler(() =>
    Promise.reject(new Error("postgres://user:secret-password@db/private"))
  );

  const response = await handler(new Request("http://localhost/api/users"));

  assertEquals(response.status, 500);
  assertEquals(await response.json(), { error: "Could not query users." });
});
