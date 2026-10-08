/**
 * Makes user input safe to use inside a SQL LIKE pattern. Prisma's `contains` passes the text
 * through unescaped, so a search for `%` or `_` would match everything or any single character.
 * Postgres uses the backslash as the default escape character.
 */
export const escapeLike = (text: string): string => text.replace(/[\\%_]/g, '\\$&');
