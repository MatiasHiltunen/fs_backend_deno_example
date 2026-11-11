import { openDatabase } from "../server/db.ts"
import { strict as assert } from "node:assert"

// Tämä koe käyttää omaa tiedostoa. Sovelluksen tietoja ei tyhjennetä.
Deno.mkdirSync("data", { recursive: true })
const directory = Deno.makeTempDirSync({ dir: "data", prefix: "migration-demo-" })
const file = `${directory}/before-and-after.sqlite`
let db = openDatabase(file, 1)
db.prepare("INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)")
  .run("Migraation testikäyttäjä", "migration@example.test", "not-a-login-account")
db.prepare("INSERT INTO tasks (title, created_by) VALUES (?, ?)")
  .run("Vanha tehtävä säilyy", 1)
console.log("ENNEN: versio 1, tehtävällä ei vielä ole prioriteettia")
console.table(db.prepare("SELECT id, title FROM tasks").all())
db.close()

// Avaamme saman tiedoston uudessa yhteydessä ja ajamme uuden migraation.
db = openDatabase(file)
const task = db.prepare("SELECT id, title, priority FROM tasks").get()!
assert.equal(task.title, "Vanha tehtävä säilyy")
assert.equal(task.priority, "normal")
console.log("JÄLKEEN: sama rivi säilyi ja sai oletusprioriteetin")
console.table([task])
db.close()

// Kolmas avaus todistaa, ettei migraation uudelleenajo monista tai poista rivejä.
db = openDatabase(file)
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM tasks").get()!.n, 1)
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get()!.n, 2)
console.log("OK: uudelleenajo ja tiedoston uudelleenavaus säilyttävät tiedot")
console.log(`Tietokanta: ${file}`)
db.close()
