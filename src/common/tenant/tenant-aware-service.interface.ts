import { TenantContext } from './tenant-context.types';

/** Standard boundary for future tenant-owned application operations. */
export interface TenantAwareService<TInput, TResult> {
  execute(context: TenantContext, input: TInput): Promise<TResult>;
}
