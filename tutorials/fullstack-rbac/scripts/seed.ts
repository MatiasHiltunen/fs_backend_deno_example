import { openDatabase } from "../server/db.ts"
import { hashPassword } from "../server/security.ts"

// Vain paikallisen tutoriaalin demotunnukset. Emme ylikirjoita olemassa olevia käyttäjiä.
const db = openDatabase()
try {
  if (db.prepare("SELECT COUNT(*) AS n FROM users").get()!.n !== 0) {
    throw new Error("Demotunnukset luodaan vain tyhjään käyttäjätauluun")
  }
  const password = "OpetusDemo2026!"
  for (
    const [name, email, role] of [
      ["Aino Admin", "admin@example.test", "admin"],
      ["Elli Editor", "editor@example.test", "editor"],
      ["Ville Viewer", "viewer@example.test", "viewer"],
    ]
  ) {
    db.prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)")
      .run(name, email, await hashPassword(password), role)
  }
  db.prepare("INSERT INTO tasks (title, priority, created_by) VALUES (?, ?, ?)")
    .run("Testaa tiimin käyttöoikeudet", "high", 1)
  console.log("Demotunnukset: admin@example.test, editor@example.test, viewer@example.test")
  console.log(`Paikallisen demon salasana: ${password}`)
} finally {
  db.close()
}
