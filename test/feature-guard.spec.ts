import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FeatureKey } from '@prisma/client';
import { FeatureGuard } from '../src/entitlements/feature.guard';
describe('FeatureGuard fix 000092', () => {
  const context = (tenantContext?: object) => ({ getHandler: () => class Handler {}, getClass: () => class Controller {}, switchToHttp: () => ({ getRequest: () => ({ user: tenantContext ? { tenantContext } : {} }) }) }) as unknown as ExecutionContext;
  it('allows only after the independent entitlement check succeeds', async () => { const reflector = { getAllAndOverride: jest.fn().mockReturnValue(FeatureKey.SSO) } as unknown as Reflector; const entitlements = { isFeatureEnabled: jest.fn().mockResolvedValue(true) }; await expect(new FeatureGuard(reflector, entitlements as any).canActivate(context({ organizationId: 'org-a' }))).resolves.toBe(true); expect(entitlements.isFeatureEnabled).toHaveBeenCalledWith({ organizationId: 'org-a' }, FeatureKey.SSO); });
  it('denies a disabled Feature even after authentication established tenant context', async () => { const reflector = { getAllAndOverride: jest.fn().mockReturnValue(FeatureKey.SSO) } as unknown as Reflector; await expect(new FeatureGuard(reflector, { isFeatureEnabled: jest.fn().mockResolvedValue(false) } as any).canActivate(context({ organizationId: 'org-a' }))).rejects.toBeInstanceOf(ForbiddenException); });
  it('fails closed without trusted TenantContext', async () => { const reflector = { getAllAndOverride: jest.fn().mockReturnValue(FeatureKey.SSO) } as unknown as Reflector; await expect(new FeatureGuard(reflector, { isFeatureEnabled: jest.fn() } as any).canActivate(context())).rejects.toBeInstanceOf(ForbiddenException); });
});
