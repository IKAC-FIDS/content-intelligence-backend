import { GUARDS_METADATA } from '@nestjs/common/constants';
import { PlatformAdminGuard } from '../src/platform-authority/platform-admin.guard';
import {
  PlatformOrganizationQuotaController,
  PlatformPlanQuotaController,
  TenantQuotaController,
} from '../src/quota/quota.controller';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
describe('quota control-plane boundaries fix 000093', () => {
  it.each([PlatformPlanQuotaController, PlatformOrganizationQuotaController])(
    'requires PlatformAdminGuard for %p',
    (controller) =>
      expect(Reflect.getMetadata(GUARDS_METADATA, controller)).toContain(
        PlatformAdminGuard,
      ),
  );
  it('tenant read API requires tenant JWT and exposes no mutation method', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, TenantQuotaController),
    ).toContain(JwtAuthGuard);
    expect(
      Object.getOwnPropertyNames(TenantQuotaController.prototype).filter(
        (name) => name !== 'constructor',
      ),
    ).toEqual(['current']);
  });
  it('Platform control plane does not inject tenant business-data services', () => {
    expect(PlatformPlanQuotaController.length).toBe(1);
    expect(PlatformOrganizationQuotaController.length).toBe(1);
  });
});
