export interface UserListOptions {
  limit: number;
  offset: number;
}

export const DEFAULT_USER_LIMIT = 10;
export const MAX_USER_LIMIT = 100;
export const MAX_USER_OFFSET = 1_000_000;

function readInteger(
  params: URLSearchParams,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const values = params.getAll(name);
  if (values.length === 0) return fallback;
  if (values.length !== 1) {
    throw new RangeError(`${name} must be specified only once.`);
  }

  const raw = values[0];
  const value = Number(raw);
  if (
    !/^(0|[1-9][0-9]*)$/.test(raw) || !Number.isSafeInteger(value) ||
    value < min || value > max
  ) {
    throw new RangeError(
      `${name} must be a decimal integer between ${min} and ${max}.`,
    );
  }

  return value;
}

export function parsePagination(params: URLSearchParams): UserListOptions {
  return {
    limit: readInteger(params, "limit", DEFAULT_USER_LIMIT, 1, MAX_USER_LIMIT),
    offset: readInteger(params, "offset", 0, 0, MAX_USER_OFFSET),
  };
}
