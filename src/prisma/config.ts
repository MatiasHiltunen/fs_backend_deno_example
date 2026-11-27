const requiredParameters = [
  "PGHOST",
  "PGUSER",
  "PGPASSWORD",
  "PGDATABASE",
] as const;

function databaseHostname(host: string): string {
  const invalidHost = () =>
    new Error(
      "Invalid PGHOST: use a hostname or IP address without a port or URL components",
    );

  // A host is a single connection parameter, never an arbitrary URL authority.
  if (/[\s@/\\?#%]/u.test(host)) throw invalidHost();
  // Check the original authority before URL parsing normalizes :80 or an empty port.
  if (host.startsWith("[") && !/^\[[^\]]+\]$/u.test(host)) {
    throw invalidHost();
  }
  const authority = host.includes(":") && !host.startsWith("[")
    ? `[${host}]`
    : host;

  let parsed: URL;
  try {
    parsed = new URL(`http://${authority}`);
  } catch {
    throw invalidHost();
  }

  if (
    parsed.username || parsed.password || parsed.port ||
    parsed.pathname !== "/" || parsed.search || parsed.hash
  ) {
    throw invalidHost();
  }

  const hostname = parsed.hostname;
  if (hostname.startsWith("[")) return hostname; // URL validates IPv6 syntax.

  // Reject incomplete/non-decimal IPv4 forms rather than silently changing them.
  if (/^[\d.]+$/u.test(hostname) && hostname !== host) {
    throw invalidHost();
  }

  const domain = hostname.endsWith(".") ? hostname.slice(0, -1) : hostname;
  if (
    domain.length > 253 ||
    domain.split(".").some((label) =>
      !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/iu.test(label)
    )
  ) {
    throw invalidHost();
  }
  return hostname;
}

function encodedParameter(value: string, key: string): string {
  try {
    return encodeURIComponent(value);
  } catch {
    throw new Error(`${key} must contain valid Unicode`);
  }
}

/** Resolve the same PostgreSQL connection URL for the server and Prisma CLI. */
export function databaseUrlFromEnv(
  env: Record<string, string | undefined>,
): string {
  for (const key of requiredParameters) {
    if (env[key] === undefined || env[key] === "") {
      throw new Error(`Missing database parameter: ${key}`);
    }
  }

  const rawPort = env.PGPORT ?? "5432";
  const port = Number(rawPort);
  if (
    !/^\d+$/u.test(rawPort) || !Number.isInteger(port) || port < 1 ||
    port > 65535
  ) {
    throw new Error("PGPORT must be a decimal integer between 1 and 65535");
  }

  const database = env.PGDATABASE!;
  // WHATWG URLs normalize these names into a different path, even when encoded.
  if (database === "." || database === "..") {
    throw new Error("PGDATABASE must not be a dot path segment");
  }

  const url = new URL(`postgres://${databaseHostname(env.PGHOST!)}:${port}/`);
  url.username = encodedParameter(env.PGUSER!, "PGUSER");
  url.password = encodedParameter(env.PGPASSWORD!, "PGPASSWORD");
  url.pathname = `/${encodedParameter(database, "PGDATABASE")}`;
  return url.href;
}
