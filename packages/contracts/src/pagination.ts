import { z } from "zod";

/**
 * Cursor pagination, never offset (architecture §8.1). The cursor is an
 * opaque base64 of `${sortValue} ${id}` minted server-side — the client
 * never parses it, only round-trips it.
 */
export const cursorSchema = z.string().min(1).max(512);
export type Cursor = z.infer<typeof cursorSchema>;

export function pageSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    nextCursor: cursorSchema.nullable(),
  });
}
export type Page<T> = { items: T[]; nextCursor: Cursor | null };
