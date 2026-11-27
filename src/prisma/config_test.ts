import { deepStrictEqual as assertEquals, throws } from "node:assert/strict";
import * as hegel from "@hegeldev/hegel";
import * as gs from "@hegeldev/hegel/generators";
import { databaseUrlFromEnv } from "./config.ts";

const baseEnv = {
  PGHOST: "localhost",
  PGUSER: "app",
  PGPASSWORD: "secret",
  PGDATABASE: "example",
};

Deno.test("database configuration defaults only the port", () => {
  assertEquals(
    databaseUrlFromEnv(baseEnv),
    "postgres://app:secret@localhost:5432/example",
  );

  for (const key of Object.keys(baseEnv)) {
    for (const value of [undefined, ""]) {
      throws(
        () => databaseUrlFromEnv({ ...baseEnv, [key]: value }),
        (error: unknown) => {
          assertEquals(error instanceof Error, true);
          if (!(error instanceof Error)) return false;
          assertEquals(error.message, `Missing database parameter: ${key}`);
          assertEquals(error.message.includes(baseEnv.PGPASSWORD), false);
          return true;
        },
      );
    }
  }
});

Deno.test("database configuration rejects invalid ports", () => {
  for (
    const PGPORT of [
      "",
      "0",
      "65536",
      "-1",
      "+5432",
      "54.32",
      "5e3",
      "0x1538",
      "5432xyz",
      "NaN",
      "Infinity",
      " 5432",
      "5432 ",
    ]
  ) {
    throws(
      () => databaseUrlFromEnv({ ...baseEnv, PGPORT }),
      { name: "Error", message: /PGPORT/ },
    );
  }

  for (const PGPORT of ["1", "5432", "65535"]) {
    assertEquals(
      new URL(databaseUrlFromEnv({ ...baseEnv, PGPORT })).port,
      PGPORT,
    );
  }
});

const validHosts = [
  ["localhost", "localhost"],
  ["db.internal", "db.internal"],
  ["127.0.0.1", "127.0.0.1"],
  ["::1", "[::1]"],
  ["[::1]", "[::1]"],
  ["2001:db8::1", "[2001:db8::1]"],
] as const;

Deno.test("database configuration supports hostnames, IPv4 and IPv6", () => {
  for (const [PGHOST, expected] of validHosts) {
    assertEquals(
      new URL(databaseUrlFromEnv({ ...baseEnv, PGHOST })).hostname,
      expected,
    );
  }
});

Deno.test("database configuration rejects malformed hosts and URL injection", () => {
  for (
    const PGHOST of [
      "localhost:5432",
      "user@localhost",
      "localhost/path",
      "localhost?sslmode=disable",
      "localhost#fragment",
      "db\\host",
      "db host",
      "db\n",
      "db%2eexample",
      "[::1]:5432",
      "[::1]:80",
      "[::1]:",
      "[::1]/x",
      "-db.local",
      "db..local",
      "db_",
      "999.1.1.1",
      "127.1",
      "0177.0.0.1",
      "0x7f000001",
      "2130706433",
    ]
  ) {
    throws(
      () => databaseUrlFromEnv({ ...baseEnv, PGHOST }),
      { name: "Error", message: /PGHOST/ },
    );
  }
});

Deno.test("database configuration rejects names normalized away by URL parsing", () => {
  for (const PGDATABASE of [".", ".."]) {
    throws(
      () => databaseUrlFromEnv({ ...baseEnv, PGDATABASE }),
      { name: "Error", message: /PGDATABASE/ },
    );
  }
});

Deno.test("database configuration preserves reserved characters", () => {
  const env = {
    ...baseEnv,
    PGUSER: "user:@/?#% ä",
    PGPASSWORD: "secret:@/?#% å",
    PGDATABASE: "data/..?#% ö",
  };
  const url = new URL(databaseUrlFromEnv(env));
  assertEquals(decodeURIComponent(url.username), env.PGUSER);
  assertEquals(decodeURIComponent(url.password), env.PGPASSWORD);
  assertEquals(decodeURIComponent(url.pathname.slice(1)), env.PGDATABASE);
  assertEquals(url.hostname, "localhost");
  assertEquals(url.search, "");
  assertEquals(url.hash, "");
});

Deno.test("Hegel: connection parameters survive a URL round trip", () => {
  hegel.test((tc) => {
    const text = gs.text({
      minSize: 1,
      maxSize: 40,
      codec: "utf-8",
      excludeCharacters: "\0",
    });
    const [PGHOST, expectedHostname] = tc.draw(gs.sampledFrom(validHosts));
    const PGUSER = tc.draw(text, "username");
    const PGPASSWORD = tc.draw(text, "password");
    const PGDATABASE = `db-${tc.draw(text, "database")}`;
    const PGPORT = String(
      tc.draw(gs.integers({ minValue: 1, maxValue: 65535 })),
    );

    const url = new URL(databaseUrlFromEnv({
      PGHOST,
      PGUSER,
      PGPASSWORD,
      PGDATABASE,
      PGPORT,
    }));
    assertEquals(url.protocol, "postgres:");
    assertEquals(url.hostname, expectedHostname);
    assertEquals(url.port, PGPORT);
    assertEquals(decodeURIComponent(url.username), PGUSER);
    assertEquals(decodeURIComponent(url.password), PGPASSWORD);
    assertEquals(decodeURIComponent(url.pathname.slice(1)), PGDATABASE);
    assertEquals(url.search, "");
    assertEquals(url.hash, "");
  }, { testCases: 100, database: hegel.Database.disabled });
});

Deno.test("Hegel: out-of-range ports are always rejected", () => {
  hegel.test((tc) => {
    const port = tc.draw(gs.oneOf(
      gs.integers({ minValue: -1_000_000, maxValue: 0 }),
      gs.integers({ minValue: 65536, maxValue: 1_000_000 }),
    ));
    throws(
      () => databaseUrlFromEnv({ ...baseEnv, PGPORT: String(port) }),
      { name: "Error", message: /PGPORT/ },
    );
  }, { testCases: 100, database: hegel.Database.disabled });
});
