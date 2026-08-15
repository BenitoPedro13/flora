import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { organizations } from '@flora/db';
import type { Tx } from '@flora/db';
import { TenantTx } from '../../src/tenancy/tenant-tx.decorator.js';

/**
 * Test-only. TASK-auth-tenancy's cross-tenant suite (NFR-7, §6.6) needs an
 * org-scoped resource to probe before any real one exists — TASK-fields adds
 * the first, at which point this fixture is deleted and the registry in
 * tenancy.e2e.spec.ts gains a real entry instead. Proves the same mechanism
 * a real resource would use: TenantInterceptor + RLS, over real HTTP.
 */
@Controller('test-fixtures/organizations')
export class TenantProbeController {
  @Get(':id')
  async getOrganization(@Param('id') id: string, @TenantTx() tx: Tx) {
    const [row] = await tx
      .select()
      .from(organizations)
      .where(eq(organizations.id, id))
      .limit(1);
    if (!row) {
      throw new NotFoundException();
    }
    return { id: row.id, name: row.name };
  }
}
