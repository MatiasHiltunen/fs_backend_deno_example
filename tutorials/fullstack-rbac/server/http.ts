export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export function requireValue(
  condition: unknown,
  status: number,
  message: string,
): asserts condition {
  if (!condition) throw new HttpError(status, message)
}

// TypeScript ei tarkista verkosta saapunutta JSONia. Tarkistamme sen ajon aikana.
export async function readBody(request: Request, fields: string[]) {
  requireValue(
    request.headers.get("content-type")?.split(";")[0] === "application/json",
    415,
    "Käytä application/json-sisältötyyppiä",
  )
  const reader = request.body?.getReader()
  requireValue(reader, 400, "JSON-runko puuttuu")
  const decoder = new TextDecoder()
  let text = ""
  let size = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 16_384) {
        await reader.cancel()
        throw new HttpError(413, "Pyyntö on liian suuri")
      }
      text += decoder.decode(value, { stream: true })
    }
  } finally {
    reader.releaseLock()
  }
  let body
  try {
    body = JSON.parse(text + decoder.decode())
  } catch {
    throw new HttpError(400, "JSON ei ole kelvollista")
  }
  requireValue(body && typeof body === "object" && !Array.isArray(body), 400, "Anna JSON-olio")
  requireValue(Object.keys(body).every((key) => fields.includes(key)), 400, "Tuntematon kenttä")
  return body as Record<string, unknown>
}

export function text(value: unknown, label: string, max = 160) {
  requireValue(typeof value === "string", 400, `${label} puuttuu`)
  const result = value.trim()
  requireValue(result.length > 0 && result.length <= max, 400, `${label} on väärän pituinen`)
  return result
}

export function account(body: Record<string, unknown>) {
  const name = text(body.name, "Nimi", 80)
  const email = text(body.email, "Sähköposti", 254).toLowerCase()
  requireValue(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 400, "Tarkista sähköposti")
  requireValue(
    typeof body.password === "string" && body.password.length >= 12 &&
      body.password.length <= 128,
    400,
    "Salasanassa on oltava 12–128 merkkiä",
  )
  return { name, email, password: body.password }
}

export const roles = ["viewer", "editor", "admin"] as const
export function role(value: unknown) {
  requireValue(roles.some((item) => item === value), 400, "Tuntematon rooli")
  return value as typeof roles[number]
}

export function priority(value: unknown) {
  requireValue(["low", "normal", "high"].includes(String(value)), 400, "Tuntematon prioriteetti")
  return String(value)
}
