import { SetMetadata } from '@nestjs/common';
import type { Role } from '@flora/contracts';

export const ROLES_KEY = 'roles';

/** No role-gated resource exists yet — see roles.guard.spec.ts (TASK-auth-tenancy §5). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
