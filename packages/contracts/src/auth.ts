import { z } from "zod";

/**
 * The single source of truth for membership roles (invariant 4). The Postgres
 * enum `membership_role` (packages/db/src/schema/auth.ts) and this schema's
 * values must always match — the Drizzle enum is generated from this array,
 * not the other way round.
 */
export const membershipRoleValues = ["owner", "manager", "operator", "viewer"] as const;
export const roleSchema = z.enum(membershipRoleValues);
export type Role = z.infer<typeof roleSchema>;

export const loginRequestSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const membershipSchema = z.object({
  organizationId: z.uuid(),
  organizationName: z.string(),
  role: roleSchema,
});
export type Membership = z.infer<typeof membershipSchema>;

export const sessionUserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  name: z.string().nullable(),
});
export type SessionUser = z.infer<typeof sessionUserSchema>;

export const sessionSchema = z.object({
  user: sessionUserSchema,
  organization: z.object({
    id: z.uuid(),
    name: z.string(),
  }),
  role: roleSchema,
});
export type Session = z.infer<typeof sessionSchema>;

/**
 * RFC 9457 `application/problem+json` (architecture §8.1). `errors` is an
 * optional field, not RFC vocabulary — used to carry Zod validation issues.
 */
export const problemDetailsSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  instance: z.string().optional(),
  errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});
export type ProblemDetails = z.infer<typeof problemDetailsSchema>;
