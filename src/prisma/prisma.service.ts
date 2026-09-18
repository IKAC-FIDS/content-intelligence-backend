import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import type { TenantContext } from '../common/tenant/tenant-context.types';
import { assertActiveTenantContext } from '../common/tenant/tenant-context.util';

export type TenantTransactionClient = Prisma.TransactionClient;

export interface TenantTransactionOptions {
  maxWait?: number;
  timeout?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * The only normal-runtime boundary that installs PostgreSQL RLS authority.
   * `set_config(..., true)` is transaction-local and therefore cannot survive
   * COMMIT/ROLLBACK or leak when Prisma returns a connection to its pool.
   */
  async withTenantTransaction<T>(
    context: TenantContext,
    callback: (tx: TenantTransactionClient) => Promise<T>,
    options?: TenantTransactionOptions,
  ): Promise<T> {
    assertActiveTenantContext(context);

    return this.$transaction(async (tx) => {
      await this.installTenantContext(tx, context);
      return callback(tx);
    }, options);
  }

  /** Use only when a caller already owns the interactive transaction. */
  async installTenantContext(
    tx: TenantTransactionClient,
    context: TenantContext,
  ): Promise<void> {
    assertActiveTenantContext(context);

    const [row] = await tx.$queryRaw<Array<{ organizationId: string }>>(
      Prisma.sql`
        SELECT set_config(
          'app.current_organization_id',
          ${context.organizationId},
          true
        ) AS "organizationId"
      `,
    );

    if (row?.organizationId !== context.organizationId) {
      throw new Error('PostgreSQL Tenant context was not installed');
    }
  }
}
