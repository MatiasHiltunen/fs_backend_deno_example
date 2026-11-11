import { strict as assert } from "node:assert"
import { migrate, openDatabase } from "../server/db.ts"
import { createApp } from "../server/app.ts"
import { hashPassword, verifyPassword } from "../server/security.ts"

const origin = "http://127.0.0.1:8000"
const password = "TestinSalasana2026!"

function fixture() {
  const db = openDatabase(":memory:")
  const app = createApp(db, origin)
  const request = (
    path: string,
    method = "GET",
    body?: unknown,
    cookie = "",
    customOrigin = origin,
  ) =>
    app(
      new Request(`${origin}/api${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          Origin: customOrigin,
          Cookie: cookie,
          "X-CSRF-Guard": "1",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    )
  async function register(email: string, role = "viewer") {
    const response = await request("/register", "POST", { name: email, email, password })
    assert.equal(response.status, 201)
    const user = await response.json()
    if (role !== "viewer") db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, user.id)
    return { ...user, cookie: response.headers.get("set-cookie")!.split(";")[0] }
  }
  return { db, app, request, register }
}

Deno.test("salasana: eri suolat, oikea ja väärä salasana", async () => {
  const first = await hashPassword(password)
  const second = await hashPassword(password)
  assert.notEqual(first, second)
  assert.equal(await verifyPassword(password, first), true)
  assert.equal(await verifyPassword("VääräSalasana2026!", first), false)
})

Deno.test("rekisteröinti: validointi, uniikki email ja roolin väärentäminen", async () => {
  const f = fixture()
  try {
    assert.equal(
      (await f.request("/register", "POST", {
        name: "Aino",
        email: "a@example.test",
        password,
        role: "admin",
      })).status,
      400,
    )
    assert.equal(
      (await f.request("/register", "POST", {
        name: "Aino",
        email: "väärä",
        password: "lyhyt",
      })).status,
      400,
    )
    await f.register("a@example.test")
    assert.equal(
      (await f.request("/register", "POST", {
        name: "Toinen",
        email: "A@example.test",
        password,
      })).status,
      409,
    )
    assert.equal(f.db.prepare("SELECT role FROM users").get()!.role, "viewer")
  } finally {
    f.db.close()
  }
})

Deno.test("istunto: ei tiivisteitä API:ssa, vanheneminen ja logout", async () => {
  const f = fixture()
  try {
    const user = await f.register("session@example.test")
    const login = await f.request("/login", "POST", { email: user.email, password })
    assert.equal(login.status, 200)
    const cookieHeader = login.headers.get("set-cookie")!
    assert.match(cookieHeader, /HttpOnly; SameSite=Strict/)
    const cookie = cookieHeader.split(";")[0]
    assert.equal("password_hash" in await login.json(), false)
    assert.equal((await f.request("/me", "GET", undefined, cookie)).status, 200)
    const rawToken = cookie.split("=")[1]
    assert.notEqual(
      f.db.prepare("SELECT token_hash FROM sessions LIMIT 1").get()!.token_hash,
      rawToken,
    )
    assert.equal((await f.request("/logout", "POST", {}, cookie)).status, 204)
    assert.equal((await f.request("/me", "GET", undefined, cookie)).status, 401)
    f.db.prepare("UPDATE sessions SET expires_at = 0").run()
    assert.equal((await f.request("/me", "GET", undefined, user.cookie)).status, 401)
    assert.equal(
      (await f.request("/login", "POST", { email: user.email, password: "väärä" })).status,
      401,
    )
  } finally {
    f.db.close()
  }
})

Deno.test("RBAC: katselija lukee, muokkaaja tekee CRUDin, admin hallitsee käyttäjiä", async () => {
  const f = fixture()
  try {
    const viewer = await f.register("viewer@example.test")
    const editor = await f.register("editor@example.test", "editor")
    const admin = await f.register("admin@example.test", "admin")
    assert.equal((await f.request("/tasks")).status, 401)
    assert.equal((await f.request("/tasks", "GET", undefined, viewer.cookie)).status, 200)
    for (const cookie of [viewer.cookie, editor.cookie]) {
      assert.equal((await f.request("/users", "GET", undefined, cookie)).status, 403)
      assert.equal(
        (await f.request(`/users/${viewer.id}`, "PATCH", { role: "admin" }, cookie)).status,
        403,
      )
    }
    assert.equal(
      (await f.request("/tasks", "POST", { title: "Estetty" }, viewer.cookie)).status,
      403,
    )
    const response = await f.request("/tasks", "POST", {
      title: "'); DROP TABLE users; --",
      priority: "high",
    }, editor.cookie)
    assert.equal(response.status, 201)
    const { id } = await response.json()
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM users").get()!.n, 3)
    assert.equal(
      (await f.request(`/tasks/${id}`, "PATCH", { done: true, title: "Valmis" }, editor.cookie))
        .status,
      200,
    )
    const tasks = await (await f.request("/tasks", "GET", undefined, viewer.cookie)).json()
    assert.equal(tasks[0].done, true)
    assert.equal(tasks[0].title, "Valmis")
    assert.equal((await f.request(`/tasks/${id}`, "DELETE", undefined, viewer.cookie)).status, 403)
    assert.equal((await f.request(`/tasks/${id}`, "DELETE", undefined, editor.cookie)).status, 204)
    assert.equal(
      (await f.request(`/tasks/${id}`, "PATCH", { done: true }, editor.cookie)).status,
      404,
    )
    const users = await (await f.request("/users", "GET", undefined, admin.cookie)).json()
    assert.equal(users.length, 3)
    assert.equal(users.some((user: Record<string, unknown>) => "password_hash" in user), false)
  } finally {
    f.db.close()
  }
})

Deno.test("käyttäjähallinta: luonti, nimen muutos, rooli, sulkeminen, avaaminen ja poisto", async () => {
  const f = fixture()
  try {
    const admin = await f.register("owner@example.test", "admin")
    const created = await f.request("/users", "POST", {
      name: "Uusi",
      email: "new@example.test",
      password,
      role: "editor",
    }, admin.cookie)
    assert.equal(created.status, 201)
    const { id } = await created.json()
    const login = await f.request("/login", "POST", { email: "new@example.test", password })
    const cookie = login.headers.get("set-cookie")!.split(";")[0]
    assert.equal(
      (await f.request(
        `/users/${id}`,
        "PATCH",
        { name: "Uusi nimi", role: "viewer" },
        admin.cookie,
      )).status,
      200,
    )
    // Sama eväste ei saa enää kirjoittaa: rooli haetaan uudelleen tietokannasta.
    assert.equal((await f.request("/tasks", "POST", { title: "Estetty" }, cookie)).status, 403)
    assert.equal(
      (await f.request(`/users/${id}`, "PATCH", { active: false }, admin.cookie)).status,
      200,
    )
    assert.equal((await f.request("/me", "GET", undefined, cookie)).status, 401)
    assert.equal(
      (await f.request("/login", "POST", { email: "new@example.test", password })).status,
      401,
    )
    assert.equal(
      (await f.request(`/users/${id}`, "PATCH", { active: true }, admin.cookie)).status,
      200,
    )
    assert.equal((await f.request("/me", "GET", undefined, cookie)).status, 401)
    assert.equal(
      (await f.request("/login", "POST", { email: "new@example.test", password })).status,
      200,
    )
    assert.equal((await f.request(`/users/${id}`, "DELETE", undefined, admin.cookie)).status, 204)
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?").get(id)!.n, 0)
  } finally {
    f.db.close()
  }
})

Deno.test("viimeinen ylläpitäjä säilyy ja tuntemattomat arvot hylätään", async () => {
  const f = fixture()
  try {
    const admin = await f.register("only@example.test", "admin")
    for (const change of [{ role: "viewer" }, { active: false }]) {
      assert.equal(
        (await f.request(`/users/${admin.id}`, "PATCH", change, admin.cookie)).status,
        409,
      )
    }
    assert.equal(
      (await f.request(`/users/${admin.id}`, "DELETE", undefined, admin.cookie)).status,
      409,
    )
    assert.equal(
      (await f.request(`/users/${admin.id}`, "PATCH", { role: "root" }, admin.cookie)).status,
      400,
    )
    assert.equal(
      (await f.request("/tasks", "POST", { title: "T", priority: "root" }, admin.cookie)).status,
      400,
    )
    assert.equal((await f.request("/tasks", "POST", { title: " " }, admin.cookie)).status, 400)
  } finally {
    f.db.close()
  }
})

Deno.test("HTTP-suojaus: Origin, JSON, kokoraja ja yritysrajoitus", async () => {
  const f = fixture()
  try {
    const user = await f.register("safe@example.test")
    for (const other of ["https://evil.example", "null", ""]) {
      assert.equal((await f.request("/logout", "POST", {}, user.cookie, other)).status, 403)
    }
    const raw = (headers: Record<string, string>, body: string) =>
      f.app(
        new Request(`${origin}/api/login`, {
          method: "POST",
          headers: { "X-CSRF-Guard": "1", ...headers },
          body,
        }),
        "another-address",
      )
    assert.equal((await raw({ Origin: origin, "Content-Type": "text/plain" }, "x")).status, 415)
    assert.equal(
      (await raw({ Origin: origin, "Content-Type": "application/json" }, "{")).status,
      400,
    )
    assert.equal(
      (await raw({ Origin: origin, "Content-Type": "application/json" }, "x".repeat(17_000)))
        .status,
      413,
    )
    let response
    for (let i = 0; i < 8; i++) {
      response = await f.request("/login", "POST", { email: "unknown@example.test", password })
    }
    assert.equal(response!.status, 429)
    assert.equal(response!.headers.get("retry-after"), "900")
  } finally {
    f.db.close()
  }
})

Deno.test("migraatio: vanha rivi säilyy, uudelleenajo ei muuta dataa ja tiedosto säilyy", () => {
  Deno.mkdirSync("data", { recursive: true })
  const folder = Deno.makeTempDirSync({ dir: "data", prefix: "test-" })
  const file = `${folder}/app.sqlite`
  let db = openDatabase(file, 1)
  try {
    db.prepare("INSERT INTO tasks (title) VALUES (?)").run("Versio yksi")
    db.close()
    db = openDatabase(file)
    assert.equal(db.prepare("SELECT priority FROM tasks").get()!.priority, "normal")
    db.close()
    db = openDatabase(file)
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM tasks").get()!.n, 1)
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get()!.n, 2)
  } finally {
    db.close()
    Deno.removeSync(folder, { recursive: true })
  }
})

Deno.test("Codespaces: vain tunnettu Origin-uudelleenkirjoitus ja suojaotsake hyväksytään", async () => {
  const f = fixture()
  const publicOrigin = "https://example-8000.app.github.dev"
  const app = createApp(f.db, publicOrigin)
  const data = { name: "Proxytesti", email: "proxy@example.test", password }
  const send = (source: string, guard?: string) =>
    app(
      new Request(`${publicOrigin}/api/register`, {
        method: "POST",
        headers: {
          Origin: source,
          "Content-Type": "application/json",
          ...(guard ? { "X-CSRF-Guard": guard } : {}),
        },
        body: JSON.stringify(data),
      }),
    )
  try {
    assert.equal((await send("https://localhost:8000")).status, 403)
    assert.equal((await send(publicOrigin)).status, 403)
    assert.equal((await send("https://evil.example", "1")).status, 403)
    const created = await send("https://localhost:8000", "1")
    assert.equal(created.status, 201)
    assert.match(created.headers.get("set-cookie")!, /; Secure/)
    const preflight = await app(
      new Request(`${publicOrigin}/api/register`, {
        method: "OPTIONS",
        headers: {
          Origin: "https://evil.example",
          "Access-Control-Request-Headers": "x-csrf-guard",
        },
      }),
    )
    assert.equal(preflight.status, 403)
    assert.equal(preflight.headers.has("access-control-allow-origin"), false)
    assert.equal(
      (await f.request("/register", "POST", data, "", "https://localhost:8000")).status,
      403,
    )
  } finally {
    f.db.close()
  }
})

Deno.test("migraatio: SQL-virhe peruu myös rakenteen ja käytettyä tiedostoa ei saa muuttaa", () => {
  Deno.mkdirSync("data", { recursive: true })
  const folder = Deno.makeTempDirSync({ dir: "data", prefix: "test-migration-" })
  const db = openDatabase(":memory:")
  try {
    const sql = `${folder}/003_test.sql`
    Deno.writeTextFileSync(sql, "CREATE TABLE rollback_me (id INTEGER); THIS IS INVALID;")
    assert.throws(() => migrate(db, folder))
    assert.equal(
      db.prepare("SELECT name FROM sqlite_master WHERE name = 'rollback_me'").get(),
      undefined,
    )
    assert.equal(
      db.prepare("SELECT version FROM schema_migrations WHERE version = 3").get(),
      undefined,
    )
    Deno.writeTextFileSync(sql, "CREATE TABLE kept (id INTEGER);")
    migrate(db, folder)
    Deno.writeTextFileSync(sql, "CREATE TABLE changed (id INTEGER);")
    assert.throws(() => migrate(db, folder), /muutettu/)
  } finally {
    db.close()
    Deno.removeSync(folder, { recursive: true })
  }
})
