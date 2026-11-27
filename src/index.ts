import { createHandler } from "./app.ts";

if (import.meta.main) {
  const port = Number(Deno.env.get("PORT") ?? 8000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }

  const { listUsers } = await import("./prisma/users.ts");
  Deno.serve({ port, hostname: "0.0.0.0" }, createHandler(listUsers));
}
