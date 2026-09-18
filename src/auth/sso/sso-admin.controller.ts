import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  CurrentUser,
  CurrentUserPayload,
} from "../../common/decorators/current-user.decorator";
import { Permissions } from "../../common/decorators/permissions.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { CurrentTenant } from "../../common/decorators/current-tenant.decorator";
import type { TenantContext } from "../../common/tenant/tenant-context.types";
import { CreateSsoProviderDto } from "./dto/create-sso-provider.dto";
import { UpdateSsoProviderDto } from "./dto/update-sso-provider.dto";
import { SsoProviderService } from "./sso-provider.service";
import { FeatureKey } from "@prisma/client";
import { FeatureGuard } from "../../entitlements/feature.guard";
import { RequireFeature } from "../../entitlements/require-feature.decorator";

@UseGuards(JwtAuthGuard, PermissionsGuard, FeatureGuard)
@RequireFeature(FeatureKey.SSO)
@Controller("admin/sso-providers")
export class SsoAdminController {
  constructor(private readonly service: SsoProviderService) {}

  @Get()
  @Permissions("sso-provider:view")
  listProviders(@CurrentTenant() tenant: TenantContext) {
    return this.service.listProviders(tenant);
  }

  @Get(":id")
  @Permissions("sso-provider:view")
  getProvider(@Param("id") id: string, @CurrentTenant() tenant: TenantContext) {
    return this.service.getProvider(id, tenant);
  }

  @Post()
  @Permissions("sso-provider:manage")
  createProvider(
    @Body() dto: CreateSsoProviderDto,
    @CurrentUser() actor: CurrentUserPayload,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.service.createProvider(dto, tenant, actor.userId);
  }

  @Patch(":id")
  @Permissions("sso-provider:manage")
  updateProvider(
    @Param("id") id: string,
    @Body() dto: UpdateSsoProviderDto,
    @CurrentUser() actor: CurrentUserPayload,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.service.updateProvider(id, dto, tenant, actor.userId);
  }

  @Patch(":id/disable")
  @Permissions("sso-provider:manage")
  disableProvider(
    @Param("id") id: string,
    @CurrentUser() actor: CurrentUserPayload,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.service.disableProvider(id, tenant, actor.userId);
  }

  @Delete(":id")
  @Permissions("sso-provider:manage")
  deleteProvider(
    @Param("id") id: string,
    @CurrentUser() actor: CurrentUserPayload,
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.service.deleteProvider(id, tenant, actor.userId);
  }

  @Post(":id/test-connection")
  @Permissions("sso-provider:manage")
  testConnection(
    @Param("id") id: string,
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() actor: CurrentUserPayload,
  ) {
    return this.service.testConnection(id, tenant, actor.userId);
  }
}
