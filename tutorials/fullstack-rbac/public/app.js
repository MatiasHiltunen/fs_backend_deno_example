const $ = (id) => document.getElementById(id)
const roleNames = { viewer: "Katselija", editor: "Muokkaaja", admin: "Ylläpitäjä" }
const priorityNames = { low: "Matala", normal: "Normaali", high: "Tärkeä" }
let me = null
let tasks = []
let registering = false
let filter = "all"

// Selain lähettää pyynnön. Palvelin tarkistaa sekä istunnon että käyttöoikeuden.
async function api(path, method = "GET", body) {
  const response = await fetch(`/api${path}`, {
    method,
    headers: { "X-CSRF-Guard": "1", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  })
  if (response.status === 204) return null
  const value = await response.json()
  if (!response.ok) {
    if (response.status === 401 && path !== "/login") showSignedOut()
    throw new Error(`${value.error} (${response.status})`)
  }
  return value
}

// Käyttäjän teksti asetetaan textContentilla. Sitä ei tulkita HTML-koodiksi.
function element(tag, text = "", className = "") {
  const node = document.createElement(tag)
  node.textContent = text
  node.className = className
  return node
}

function notice(message, error = false) {
  $("status").textContent = error ? "" : message
  $("error").textContent = error ? message : ""
}

// Yhteinen käsittelijä estää tuplapainalluksen ja näyttää myös palvelimen virheen.
async function perform(button, action) {
  button.disabled = true
  notice("")
  try {
    await action()
  } catch (error) {
    notice(error.message, true)
  } finally {
    button.disabled = false
  }
}

function showSignedOut() {
  me = null
  $("auth").hidden = false
  $("workspace").hidden = true
  $("identity").replaceChildren()
}

async function showWorkspace() {
  $("auth").hidden = true
  $("workspace").hidden = false
  $("identity").replaceChildren(element("span", `${me.name} · ${roleNames[me.role]}`))
  const logout = element("button", "Kirjaudu ulos", "small")
  logout.onclick = () =>
    perform(logout, async () => {
      await api("/logout", "POST", {})
      showSignedOut()
      notice("Olet kirjautunut ulos. Istunto poistettiin palvelimelta.")
    })
  $("identity").append(logout)
  const writable = me.role !== "viewer"
  $("task-form").hidden = !writable
  $("read-only").hidden = writable
  $("users-tab").hidden = me.role !== "admin"
  showTab("tasks")
  await loadTasks()
}

function showTab(name) {
  for (const tab of ["tasks", "users"]) {
    $(`${tab}-view`).hidden = tab !== name
    $(`${tab}-tab`).classList.toggle("selected", tab === name)
  }
}

async function loadTasks() {
  tasks = await api("/tasks")
  drawTasks()
}

function drawTasks() {
  const done = tasks.filter((task) => task.done).length
  $("stats").replaceChildren()
  for (
    const [label, count] of [["Tehtäviä", tasks.length], ["Kesken", tasks.length - done], [
      "Valmiina",
      done,
    ]]
  ) {
    const stat = element("div", "", "stat")
    stat.append(element("span", label), element("strong", String(count)))
    $("stats").append(stat)
  }
  $("task-list").replaceChildren()
  const visible = tasks.filter((task) => filter === "all" || task.done === (filter === "done"))
  $("empty").hidden = visible.length > 0
  for (const task of visible) {
    const row = element("li", "", `task ${task.done ? "done" : ""}`)
    const checkbox = document.createElement("input")
    checkbox.type = "checkbox"
    checkbox.checked = task.done
    checkbox.disabled = me.role === "viewer"
    checkbox.setAttribute("aria-label", `Merkitse valmiiksi: ${task.title}`)
    checkbox.onchange = () =>
      perform(checkbox, async () => {
        // Sama sääntö toistuu: palvelin ratkaisee oikeuden, vaikka selain näyttää painikkeen.
        await api(`/tasks/${task.id}`, "PATCH", { done: checkbox.checked })
        await loadTasks()
        notice("Tehtävän tila tallennettiin tietokantaan.")
      })
    const body = element("div", "", "task-body")
    const meta = element("div", "", "task-meta")
    meta.append(
      element("span", priorityNames[task.priority], `badge ${task.priority}`),
      element("span", task.author ?? "Poistettu käyttäjä"),
    )
    body.append(element("div", task.title, "task-title"), meta)
    row.append(checkbox, body)
    if (me.role !== "viewer") {
      const edit = element("button", "Muokkaa", "small")
      edit.setAttribute("aria-label", `Muokkaa tehtävää: ${task.title}`)
      edit.onclick = () => {
        const input = document.createElement("input")
        input.value = task.title
        input.maxLength = 160
        input.setAttribute("aria-label", "Tehtävän uusi nimi")
        const save = element("button", "Tallenna", "small")
        save.onclick = () =>
          perform(save, async () => {
            await api(`/tasks/${task.id}`, "PATCH", { title: input.value })
            await loadTasks()
            notice("Tehtävän nimi tallennettiin.")
          })
        body.replaceChildren(input, save)
        input.focus()
      }
      const remove = element("button", "Poista", "small danger")
      remove.setAttribute("aria-label", `Poista tehtävä: ${task.title}`)
      remove.onclick = () =>
        perform(remove, async () => {
          await api(`/tasks/${task.id}`, "DELETE")
          await loadTasks()
          notice("Tehtävä poistettiin.")
        })
      row.append(edit, remove)
    }
    $("task-list").append(row)
  }
}

async function loadUsers() {
  const users = await api("/users")
  $("user-list").replaceChildren()
  for (const user of users) {
    const row = element("div", "", "user-row")
    row.append(element("strong", user.name), element("span", user.email, "muted"))
    const controls = element("div", "", "user-controls")
    const select = document.createElement("select")
    select.setAttribute("aria-label", `Rooli: ${user.email}`)
    for (const [value, label] of Object.entries(roleNames)) {
      const option = element("option", label)
      option.value = value
      select.append(option)
    }
    select.value = user.role
    const save = element("button", "Tallenna rooli", "small")
    save.onclick = () =>
      perform(save, async () => {
        await api(`/users/${user.id}`, "PATCH", { role: select.value })
        // Haemme myös oman roolin uudelleen. Vanhat painikkeet eivät anna vanhoja oikeuksia.
        me = await api("/me")
        await showWorkspace()
        if (me.role === "admin") {
          showTab("users")
          await loadUsers()
        }
        notice("Rooli tallennettiin. Uusi oikeus on heti voimassa.")
      })
    const active = element("button", user.active ? "Sulje tunnus" : "Avaa tunnus", "small")
    active.disabled = user.id === me.id
    active.onclick = () =>
      perform(active, async () => {
        await api(`/users/${user.id}`, "PATCH", { active: !user.active })
        await loadUsers()
        notice(
          user.active
            ? "Tunnus suljettiin ja istunnot poistettiin."
            : "Tunnus avattiin. Käyttäjä voi kirjautua uudelleen.",
        )
      })
    const remove = element("button", "Poista käyttäjä", "small danger")
    remove.disabled = user.id === me.id
    remove.onclick = () =>
      perform(remove, async () => {
        await api(`/users/${user.id}`, "DELETE")
        await loadUsers()
        notice("Käyttäjä ja hänen istuntonsa poistettiin.")
      })
    controls.append(
      select,
      save,
      active,
      remove,
      element("span", user.active ? "Aktiivinen" : "Suljettu", "badge"),
    )
    row.append(controls)
    $("user-list").append(row)
  }
}

function authMode(value) {
  registering = value
  $("name-label").hidden = !value
  $("auth-form").elements.name.required = value
  $("auth-form").elements.password.autocomplete = value ? "new-password" : "current-password"
  $("auth-title").textContent = value ? "Liity tiimin tauluun" : "Tervetuloa takaisin"
  $("auth-submit").textContent = value ? "Luo tunnus" : "Kirjaudu sisään"
  $("auth-note").textContent = value
    ? "Uusi tunnus saa katselijan roolin. Ylläpitäjä voi antaa muokkausoikeuden."
    : "Oikeutesi tarkistetaan palvelimella jokaisessa pyynnössä."
  $("login-tab").classList.toggle("selected", !value)
  $("register-tab").classList.toggle("selected", value)
}

$("login-tab").onclick = () => authMode(false)
$("register-tab").onclick = () => authMode(true)
$("auth-form").onsubmit = (event) => {
  event.preventDefault()
  perform($("auth-submit"), async () => {
    const data = Object.fromEntries(new FormData(event.currentTarget))
    if (!registering) delete data.name
    me = await api(registering ? "/register" : "/login", "POST", data)
    event.target.reset()
    await showWorkspace()
    notice(
      registering ? "Tunnus luotiin. Sinulla on katselijan oikeus." : "Kirjautuminen onnistui.",
    )
  })
}
$("task-form").onsubmit = (event) => {
  event.preventDefault()
  const form = event.currentTarget
  perform(form.querySelector("button"), async () => {
    await api("/tasks", "POST", Object.fromEntries(new FormData(form)))
    form.reset()
    await loadTasks()
    notice("Uusi tehtävä tallennettiin SQLite-tietokantaan.")
  })
}
$("user-form").onsubmit = (event) => {
  event.preventDefault()
  const form = event.currentTarget
  perform(form.querySelector("button"), async () => {
    await api("/users", "POST", Object.fromEntries(new FormData(form)))
    form.reset()
    await loadUsers()
    notice("Käyttäjä luotiin valitulla roolilla.")
  })
}
$("tasks-tab").onclick = () => showTab("tasks")
$("users-tab").onclick = () =>
  perform($("users-tab"), async () => {
    await loadUsers()
    showTab("users")
  })
for (const button of $("filters").querySelectorAll("button")) {
  button.onclick = () => {
    filter = button.dataset.filter
    for (const item of $("filters").querySelectorAll("button")) {
      item.classList.toggle("selected", item === button)
    }
    drawTasks()
  }
}

// Sivun päivitys palauttaa istunnon palvelimelta. Emme säilytä roolia localStoragessa.
try {
  me = await api("/me")
  await showWorkspace()
} catch {
  showSignedOut()
}
