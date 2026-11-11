import { strict as assert } from "node:assert"

const base = "http://127.0.0.1:8000"
const origin = Deno.args[0] ?? base
let adminCookie = ""
let viewerCookie = ""
let userId = 0
let taskId = 0

// Tämä testi käyttää oikeaa HTTP-palvelinta. Evästeiden arvoja ei tulosteta.
async function call(path: string, method = "GET", body?: unknown, cookie = "") {
  return await fetch(`${base}/api${path}`, {
    method,
    headers: {
      Origin: origin,
      "X-CSRF-Guard": "1",
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}
async function expect(response: Response, status: number, explanation: string) {
  assert.equal(response.status, status, explanation)
  const value = response.status === 204 ? null : await response.json()
  console.log(`PASS ${status} — ${explanation}`)
  return value
}

try {
  let response = await call("/login", "POST", {
    email: "admin@example.test",
    password: "OpetusDemo2026!",
  })
  adminCookie = response.headers.get("set-cookie")?.split(";")[0] ?? ""
  await expect(response, 200, "Ylläpitäjä kirjautuu")
  response = await call("/register", "POST", {
    name: "HTTP-testin käyttäjä",
    email: `live-${crypto.randomUUID()}@example.test`,
    password: "TestinSalasana2026!",
  })
  viewerCookie = response.headers.get("set-cookie")?.split(";")[0] ?? ""
  const created = await expect(response, 201, "Rekisteröinti luo katselijan")
  userId = created.id
  assert.equal(created.role, "viewer")
  await expect(await call("/tasks", "GET", undefined, viewerCookie), 200, "Katselija voi lukea")
  await expect(
    await call("/tasks", "POST", { title: "Ei saa syntyä" }, viewerCookie),
    403,
    "Katselijan kirjoitus estetään API:ssa",
  )
  await expect(
    await call("/users", "GET", undefined, viewerCookie),
    403,
    "Katselija ei saa käyttäjälistaa",
  )
  await expect(
    await call(`/users/${userId}`, "PATCH", { role: "editor" }, adminCookie),
    200,
    "Ylläpitäjä antaa muokkausoikeuden",
  )
  const task = await expect(
    await call("/tasks", "POST", { title: "HTTP-testin tehtävä" }, viewerCookie),
    201,
    "Sama istunto saa uuden kirjoitusoikeuden",
  )
  taskId = task.id
  await expect(
    await call(`/tasks/${taskId}`, "PATCH", { done: true }, viewerCookie),
    200,
    "Muokkaaja päivittää tehtävän",
  )
  await expect(
    await call(`/users/${userId}`, "PATCH", { role: "viewer" }, adminCookie),
    200,
    "Ylläpitäjä poistaa muokkausoikeuden",
  )
  await expect(
    await call("/tasks", "POST", { title: "Ei saa syntyä" }, viewerCookie),
    403,
    "Vanha istunto ei säilytä vanhaa roolia",
  )
  await expect(
    await call(`/users/${userId}`, "PATCH", { active: false }, adminCookie),
    200,
    "Ylläpitäjä sulkee tunnuksen",
  )
  await expect(
    await call("/me", "GET", undefined, viewerCookie),
    401,
    "Suljetun käyttäjän istunto lakkaa toimimasta",
  )
} finally {
  // Poistetaan vain tämän testin itse luomat rivit, myös epäonnistumisen jälkeen.
  if (taskId) {
    await expect(
      await call(`/tasks/${taskId}`, "DELETE", undefined, adminCookie),
      204,
      "Testitehtävä siivotaan",
    )
  }
  if (userId) {
    await expect(
      await call(`/users/${userId}`, "DELETE", undefined, adminCookie),
      204,
      "Testikäyttäjä ja hänen istuntonsa poistetaan",
    )
  }
  if (adminCookie) {
    await expect(await call("/logout", "POST", {}, adminCookie), 204, "Uloskirjautuminen onnistuu")
    await expect(await call("/me", "GET", undefined, adminCookie), 401, "Vanha eväste hylätään")
  }
}
console.log("VALMIS: autentikaatio ja RBAC toimivat myös suorissa HTTP-pyynnöissä")
