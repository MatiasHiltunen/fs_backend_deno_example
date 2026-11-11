import type { DatabaseSync } from "node:sqlite"
import { account, HttpError, priority, readBody, requireValue, role, text } from "./http.ts"
import {
  authLimiter,
  hashPassword,
  hashToken,
  randomToken,
  sessionCookie,
  verifyPassword,
} from "./security.ts"

type User = { id: number; name: string; email: string; role: string; active: number }
const publicFields = "id, name, email, role, active"
const json = (value: unknown, status = 200) => Response.json(value, { status })
const publicUser = (user: User) => ({ ...user, active: Boolean(user.active) })

export function createApp(db: DatabaseSync, origin: string) {
  const allowAttempt = authLimiter()
  // Tuntemattomallekin käyttäjälle tehdään sama hidas salasanan laskenta.
  const dummyHash = `${"00".repeat(16)}:${"00".repeat(32)}`

  async function currentUser(request: Request) {
    const token = request.headers.get("cookie")?.match(
      /(?:^|;\s*)team_session=([a-f0-9]{64})(?:;|$)/,
    )?.[1]
    requireValue(token, 401, "Kirjaudu ensin")
    // Rooli luetaan tietokannasta jokaisella pyynnöllä. Selain ei päätä oikeutta.
    const user = db.prepare(`SELECT u.id, u.name, u.email, u.role, u.active
      FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1`)
      .get(await hashToken(token), Date.now()) as User | undefined
    requireValue(user, 401, "Istunto ei ole voimassa")
    return user
  }

  function canWrite(user: User) {
    // Tunnistettu käyttäjä voi silti saada 403:n: hänen roolinsa ei riitä kirjoittamiseen.
    requireValue(["editor", "admin"].includes(user.role), 403, "Roolillasi on vain lukuoikeus")
  }

  async function signIn(user: User) {
    // Jokainen kirjautuminen saa uuden satunnaisen tunnisteen. Rooli jää tietokantaan.
    const token = randomToken()
    db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(Date.now())
    db.prepare("INSERT INTO sessions VALUES (?, ?, ?)")
      .run(await hashToken(token), user.id, Date.now() + 28_800_000)
    const response = json(publicUser(user))
    response.headers.set("Set-Cookie", sessionCookie(token, origin))
    return response
  }

  async function handle(request: Request, address: string) {
    const path = new URL(request.url).pathname
    const method = request.method
    if (!path.startsWith("/api/")) {
      requireValue(method === "GET", 405, "Käytä GET-pyyntöä")
      const files: Record<string, [string, string]> = {
        "/": ["index.html", "text/html"],
        "/app.js": ["app.js", "text/javascript"],
        "/styles.css": ["styles.css", "text/css"],
      }
      requireValue(files[path], 404, "Sivua ei löydy")
      const [file, type] = files[path]
      return new Response(await Deno.readFile(new URL(`../public/${file}`, import.meta.url)), {
        headers: { "content-type": `${type}; charset=utf-8` },
      })
    }
    // Eväste tunnistaa käyttäjän. Nämä tarkistukset estävät eri sivuston muutospyynnön.
    if (!["GET", "HEAD"].includes(method)) {
      const source = request.headers.get("origin")
      const codespaces = new URL(origin).hostname.endsWith(".app.github.dev") &&
        origin.startsWith("https:")
      // Codespacesin välityspalvelin muuttaa Origin-arvon https://localhost:8000-muotoon.
      requireValue(
        source === origin || (codespaces && source === "https://localhost:8000"),
        403,
        "Pyynnön alkuperä ei kelpaa",
      )
      // Mukautettu otsake pakottaa vieraan sivuston preflightiin. Emme salli CORSia.
      // Arvo ei ole salasana eikä käyttäjän tunnistus: istunto ja rooli tarkistetaan lisäksi.
      requireValue(request.headers.get("x-csrf-guard") === "1", 403, "Pyynnön suojaotsake puuttuu")
    }
    if (path === "/api/health" && method === "GET") return json({ ok: true })

    if (path === "/api/register" && method === "POST") {
      requireValue(allowAttempt(address), 429, "Liikaa yrityksiä. Odota 15 minuuttia")
      const data = account(await readBody(request, ["name", "email", "password"]))
      // Rekisteröityjä ei voi valita admin-roolia. Palvelin asettaa aina viewer-roolin.
      const result = db.prepare("INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)")
        .run(data.name, data.email, await hashPassword(data.password))
      const user = db.prepare(`SELECT ${publicFields} FROM users WHERE id = ?`)
        .get(result.lastInsertRowid) as User
      const response = await signIn(user)
      return new Response(response.body, { status: 201, headers: response.headers })
    }
    if (path === "/api/login" && method === "POST") {
      // Nyt tunnistamme käyttäjän. Salasana tarkistetaan hitaalla menetelmällä.
      requireValue(allowAttempt(address), 429, "Liikaa yrityksiä. Odota 15 minuuttia")
      const data = await readBody(request, ["email", "password"])
      const email = text(data.email, "Sähköposti", 254).toLowerCase()
      requireValue(
        typeof data.password === "string" && data.password.length <= 128,
        400,
        "Tarkista salasana",
      )
      const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as
        | (User & { password_hash: string })
        | undefined
      const valid = await verifyPassword(data.password, user?.password_hash ?? dummyHash)
      requireValue(user?.active && valid, 401, "Sähköposti tai salasana on väärin")
      // Lähetä vain julkiset kentät. Salasanan tiiviste ei kuulu selaimeen.
      const safe = db.prepare(`SELECT ${publicFields} FROM users WHERE id = ?`).get(user.id) as User
      return signIn(safe)
    }

    const user = await currentUser(request)
    if (path === "/api/me" && method === "GET") return json(publicUser(user))
    if (path === "/api/logout" && method === "POST") {
      // Pelkkä evästeen poistaminen selaimesta ei riitä. Poistamme myös palvelimen istunnon.
      const token = request.headers.get("cookie")!.match(/team_session=([a-f0-9]{64})/)![1]
      db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(await hashToken(token))
      return new Response(null, {
        status: 204,
        headers: { "Set-Cookie": sessionCookie("", origin, 0) },
      })
    }

    if (path === "/api/tasks" && method === "GET") {
      // Kaikki kirjautuneet roolit saavat lukea tämän yhteisen tiimin tehtävät.
      return json(
        db.prepare(`SELECT t.*, u.name AS author FROM tasks t
        LEFT JOIN users u ON u.id = t.created_by ORDER BY t.id DESC`).all()
          .map((task) => ({ ...task, done: Boolean(task.done) })),
      )
    }
    if (path === "/api/tasks" && method === "POST") {
      // Ensin oikeus, sitten syöte, lopuksi SQL. Sama järjestys toistuu muissakin muutoksissa.
      canWrite(user)
      const data = await readBody(request, ["title", "priority"])
      // Parametrit pitävät käyttäjän syötteen erillään SQL-komennosta.
      const result = db.prepare("INSERT INTO tasks (title, priority, created_by) VALUES (?, ?, ?)")
        .run(text(data.title, "Otsikko"), priority(data.priority ?? "normal"), user.id)
      return json({ id: Number(result.lastInsertRowid) }, 201)
    }
    const taskId = path.match(/^\/api\/tasks\/([1-9]\d*)$/)?.[1]
    if (taskId && ["PATCH", "DELETE"].includes(method)) {
      // Myös yksittäisen tehtävän muutos vaatii roolin. Tunniste ei itsessään anna oikeutta.
      canWrite(user)
      const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(Number(taskId))
      requireValue(task, 404, "Tehtävää ei löydy")
      if (method === "DELETE") {
        db.prepare("DELETE FROM tasks WHERE id = ?").run(Number(taskId))
        return new Response(null, { status: 204 })
      }
      const data = await readBody(request, ["title", "done", "priority"])
      requireValue(Object.keys(data).length, 400, "Anna muutettava kenttä")
      requireValue(
        data.done === undefined || typeof data.done === "boolean",
        400,
        "done on boolean",
      )
      db.prepare("UPDATE tasks SET title = ?, done = ?, priority = ? WHERE id = ?").run(
        data.title === undefined ? task.title : text(data.title, "Otsikko"),
        data.done === undefined ? task.done : Number(data.done),
        data.priority === undefined ? task.priority : priority(data.priority),
        Number(taskId),
      )
      return json({ ok: true })
    }

    if (path === "/api/users" || /^\/api\/users\/\d+$/.test(path)) {
      // Piilotettu painike ei ole suojaus. Tämä tarkistus suojaa itse API:a.
      requireValue(user.role === "admin", 403, "Vain ylläpitäjä voi hallita käyttäjiä")
      if (path === "/api/users" && method === "GET") {
        return json(
          db.prepare(`SELECT ${publicFields} FROM users ORDER BY id`).all()
            .map((row) => publicUser(row as User)),
        )
      }
      if (path === "/api/users" && method === "POST") {
        // Ylläpitäjä voi valita roolin. Tavallinen rekisteröityminen ei voi.
        const data = await readBody(request, ["name", "email", "password", "role"])
        const value = account(data)
        const result = db.prepare(
          "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)",
        )
          .run(value.name, value.email, await hashPassword(value.password), role(data.role))
        return json({ id: Number(result.lastInsertRowid) }, 201)
      }
      const id = Number(path.split("/").at(-1))
      const target = db.prepare(`SELECT ${publicFields} FROM users WHERE id = ?`).get(id) as
        | User
        | undefined
      requireValue(target, 404, "Käyttäjää ei löydy")
      if (method === "PATCH" || method === "DELETE") {
        const data = method === "PATCH" ? await readBody(request, ["name", "role", "active"]) : {}
        const nextRole = data.role === undefined ? target.role : role(data.role)
        requireValue(
          data.active === undefined || typeof data.active === "boolean",
          400,
          "active on boolean",
        )
        const active = data.active === undefined ? target.active : Number(data.active)
        const removesAdmin = method === "DELETE" || nextRole !== "admin" || active === 0
        const admins = db.prepare(
          "SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1",
        ).get()!
        requireValue(
          !(target.role === "admin" && target.active && removesAdmin && admins.n === 1),
          409,
          "Viimeistä aktiivista ylläpitäjää ei voi poistaa",
        )
        if (method === "DELETE") {
          requireValue(id !== user.id, 409, "Et voi poistaa omaa tunnustasi")
          db.prepare("DELETE FROM users WHERE id = ?").run(id)
          return new Response(null, { status: 204 })
        }
        requireValue(Object.keys(data).length, 400, "Anna muutettava kenttä")
        db.prepare("UPDATE users SET name = ?, role = ?, active = ? WHERE id = ?").run(
          data.name === undefined ? target.name : text(data.name, "Nimi", 80),
          nextRole,
          active,
          id,
        )
        if (!active) db.prepare("DELETE FROM sessions WHERE user_id = ?").run(id)
        return json({ ok: true })
      }
    }
    throw new HttpError(404, "Rajapinnan osoitetta ei löydy")
  }

  return async (request: Request, address = "local") => {
    let response
    try {
      response = await handle(request, address)
    } catch (error) {
      if (error instanceof HttpError) response = json({ error: error.message }, error.status)
      else if (
        error instanceof Error && error.message.includes("UNIQUE constraint failed: users.email")
      ) {
        response = json({ error: "Sähköposti on jo käytössä" }, 409)
      } else {
        console.error("Pyynnön käsittely epäonnistui")
        response = json({ error: "Palvelinvirhe" }, 500)
      }
    }
    response.headers.set("Cache-Control", "no-store")
    response.headers.set("X-Content-Type-Options", "nosniff")
    response.headers.set("Referrer-Policy", "no-referrer")
    response.headers.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'",
    )
    if (response.status === 429) response.headers.set("Retry-After", "900")
    return response
  }
}
