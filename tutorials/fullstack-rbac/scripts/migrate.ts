import { openDatabase } from "../server/db.ts"

// Aja ensin versio 1, sitten kaikki migraatiot. Sama komento sopii myös uudelleenajoon.
const target = Deno.args[0] ? Number(Deno.args[0]) : Infinity
if (!(target > 0)) throw new Error("Anna positiivinen versionumero")
const db = openDatabase("data/app.sqlite", target)
console.table(db.prepare("SELECT version, name FROM schema_migrations ORDER BY version").all())
db.close()
