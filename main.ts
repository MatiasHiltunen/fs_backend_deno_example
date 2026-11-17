import postgres from "npm:postgres";

const dbParams = {
  host: Deno.env.get("PGHOST") ?? "localhost",
  port: Number(Deno.env.get("PGPORT") ?? 5432),
  user: Deno.env.get("PGUSER") ?? "postgres",
  password: Deno.env.get("PGPASSWORD"),
  database: Deno.env.get("PGDATABASE") ?? "postgres",
}

// console.log("Sql parameters:", dbParams);

const sql = postgres(dbParams);


try {
  const people = await sql`
    SELECT id, name FROM people
  `;
  console.log(people);
} catch (error) {
  const reason = (error as { code?: string }).code ?? String(error);
  console.error("Query failed:", reason); // Query failed: ECONNREFUSED
} finally {
  await sql.end();
}


export function handler(req: Request): Response {
  const url = new URL(req.url);

  if (url.pathname === "/api") {
    return Response.json({
      message: "Hello, world!",
      time: new Date().toISOString(),
    });
  }

  return new Response("<h1>Welcome to Deno!</h1>", {
    headers: { "content-type": "text/html" },
  });
}

if (import.meta.main) {
  Deno.serve({ port: 8000 }, handler);
}
