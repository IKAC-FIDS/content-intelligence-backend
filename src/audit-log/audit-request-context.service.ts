import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

export interface AuditRequestContext {
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestMethod?: string | null;
  requestPath?: string | null;
  organizationId?: string | null;
  actorUserId?: string | null;
  actorMembershipId?: string | null;
}

@Injectable()
export class AuditRequestContextService {
  private readonly storage = new AsyncLocalStorage<AuditRequestContext>();

  run(context: AuditRequestContext, callback: () => void) {
    this.storage.run(context, callback);
  }

  getContext(): AuditRequestContext | undefined {
    return this.storage.getStore();
  }

  /** Bind the resolver-validated tenant to the current request's audit scope. */
  setOrganizationId(organizationId: string): void {
    const context = this.storage.getStore();
    if (context) context.organizationId = organizationId;
  }

  setActor(actorUserId: string, actorMembershipId?: string | null): void {
    const context = this.storage.getStore();
    if (context) {
      context.actorUserId = actorUserId;
      context.actorMembershipId = actorMembershipId ?? null;
    }
  }
}
