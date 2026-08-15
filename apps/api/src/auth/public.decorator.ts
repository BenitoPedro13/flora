import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Opts a route out of the global JwtAuthGuard (default-deny, TASK-auth-tenancy §2.4). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
