import { openDatabase } from "./db.ts"
import { createApp } from "./app.ts"

// HTML, JavaScript ja API tulevat samasta alkuperästä. Emme tarvitse CORS-asetuksia.
const origin = Deno.env.get("APP_ORIGIN") ?? "http://127.0.0.1:8000"
const db = openDatabase()
const app = createApp(db, origin)

// Palvelin tarkistaa käyttäjän ja roolin jokaisessa API-pyynnössä.
Deno.serve({ hostname: "127.0.0.1", port: 8000 }, (request, info) => {
  return app(request, info.remoteAddr.hostname)
})
