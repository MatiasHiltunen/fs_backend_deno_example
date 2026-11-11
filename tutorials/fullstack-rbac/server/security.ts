import { timingSafeEqual } from "node:crypto"

const encoder = new TextEncoder()
const iterations = 600_000
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")

// Satunnaisuus tulee ajoympäristöstä. Emme kirjoita salausalgoritmia itse.
export function randomToken(bytes = 32) {
  return hex(crypto.getRandomValues(new Uint8Array(bytes)))
}

async function derive(password: string, salt: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
    "deriveBits",
  ])
  const bytes = Uint8Array.from(salt.match(/../g)!, (value) => parseInt(value, 16))
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: bytes,
      iterations,
    },
    key,
    256,
  )
  return hex(new Uint8Array(bits))
}

// Hidas salasanamenetelmä ja uusi suola erottavat saman salasanan tallenteet.
export async function hashPassword(password: string) {
  const salt = randomToken(16)
  return `${salt}:${await derive(password, salt)}`
}

export async function verifyPassword(password: string, stored: string) {
  const [salt, expected] = stored.split(":")
  const actual = await derive(password, salt)
  return timingSafeEqual(encoder.encode(actual), encoder.encode(expected))
}

// Vahvasti satunnainen istuntotunniste on eri asia kuin ihmisen salasana.
export async function hashToken(token: string) {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(token))))
}

export function sessionCookie(token: string, origin: string, maxAge = 28_800) {
  const secure = origin.startsWith("https:") ? "; Secure" : ""
  return `team_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`
}

// Rajoita raskaita kirjautumisyrityksiä ennen salasanan laskemista.
export function authLimiter() {
  const attempts = new Map<string, { count: number; until: number }>()
  return (address: string) => {
    const now = Date.now()
    for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key)
    const entry = attempts.get(address) ?? { count: 0, until: now + 900_000 }
    if (entry.count >= 8 || attempts.size >= 10_000) return false
    entry.count++
    attempts.set(address, entry)
    return true
  }
}
