import { DatabaseSync } from "node:sqlite"
import { createHash } from "node:crypto"
import { dirname, resolve } from "node:path"
import { pathToFileURL } from "node:url"

const migrations = new URL("../migrations/", import.meta.url)

// Sama yhteysasetus tarvitaan jokaisella avauksella: myös viiteavaimet tarkistetaan.
export function openDatabase(file = "data/app.sqlite", target = Infinity) {
  if (file !== ":memory:") Deno.mkdirSync(dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000")
  try {
    migrate(db, migrations, target)
    return db
  } catch (error) {
    db.close()
    throw error
  }
}

// Kirjanpito ja rakennemuutos vahvistetaan samassa transaktiossa.
// Siksi keskeytys ei voi jättää migraatiota puoliksi tehdyksi.
export function migrate(db: DatabaseSync, directory: string | URL, target = Infinity) {
  const base = directory instanceof URL ? directory : pathToFileURL(`${resolve(directory)}/`)
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL
  ) STRICT`)
  const files = [...Deno.readDirSync(directory)]
    .filter((file) => /^\d+_.+\.sql$/.test(file.name)).map((file) => file.name).sort()
  const applied = db.prepare("SELECT version FROM schema_migrations").all()
  if (applied.some((row) => Number(row.version) > target)) {
    throw new Error("Alaspäin migrointia ei tueta")
  }
  for (const name of files) {
    const version = Number(name.split("_")[0])
    if (version > target) continue
    const sql = Deno.readTextFileSync(new URL(name, base))
    const checksum = createHash("sha256").update(sql).digest("hex")
    db.exec("BEGIN IMMEDIATE")
    try {
      const old = db.prepare("SELECT checksum FROM schema_migrations WHERE version = ?").get(
        version,
      )
      if (old && old.checksum !== checksum) throw new Error(`Migraatiota ${name} on muutettu`)
      if (!old) {
        db.exec(sql)
        db.prepare("INSERT INTO schema_migrations VALUES (?, ?, ?)").run(version, name, checksum)
        console.log(`Migraatio ${version}: ${name}`)
      }
      db.exec("COMMIT")
    } catch (error) {
      db.exec("ROLLBACK")
      throw error
    }
  }
}
