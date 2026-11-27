import { db } from "./db.ts";
import { seed } from "./seed.ts";
import { DEFAULT_USER_LIMIT, type UserListOptions } from "../pagination.ts";

export { db };

export async function listUsers(
  { limit, offset }: UserListOptions = { limit: DEFAULT_USER_LIMIT, offset: 0 },
) {
  await seed();
  const users = await db.orm.public.User
    .orderBy((user) => user.id.asc())
    .select("id", "email", "username", "name", "createdAt")
    .limit(limit)
    .offset(offset)
    .all();

  return users.map((user) => ({
    id: user.id,
    email: user.email,
    username: user.username,
    name: user.name,
    createdAt: user.createdAt.toISOString(),
  }));
}

export type StarterUser = Awaited<ReturnType<typeof listUsers>>[number];
