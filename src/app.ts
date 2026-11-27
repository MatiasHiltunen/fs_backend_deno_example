import { parsePagination, type UserListOptions } from "./pagination.ts";

export type ListUsers = (
  options: UserListOptions,
) => Promise<readonly unknown[]>;

export function createHandler(listUsers: ListUsers) {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    if (url.pathname !== "/" && url.pathname !== "/api/users") {
      return Response.json({ error: "Not found." }, { status: 404 });
    }
    if (request.method !== "GET") {
      return Response.json({ error: "Method not allowed." }, {
        status: 405,
        headers: { Allow: "GET" },
      });
    }

    let pagination: UserListOptions;
    try {
      pagination = parsePagination(url.searchParams);
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      return Response.json({ error: error.message }, { status: 400 });
    }

    try {
      const users = await listUsers(pagination);
      return Response.json({ users, pagination });
    } catch {
      return Response.json({ error: "Could not query users." }, {
        status: 500,
      });
    }
  };
}
