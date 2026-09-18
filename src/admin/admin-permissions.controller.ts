import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { AdminPermissionsService } from './admin-permissions.service';

@Controller('admin/permissions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AdminPermissionsController {
  constructor(private adminPermissionsService: AdminPermissionsService) {}

  // ============================================================
  // ۱. دریافت لیست تمام دسترسی‌ها
  // ============================================================
  @Get()
  @Permissions('permission:view')
  getAllPermissions() {
    return this.adminPermissionsService.getAllPermissions();
  }

  @Get('matrix')
  @Permissions('permission:view')
  getPermissionMatrix() {
    return this.adminPermissionsService.getPermissionMatrix();
  }

  // ============================================================
  // ۲. دریافت دسترسی‌های یک نقش خاص
  // ============================================================
  @Get('roles/:role')
  @Permissions('permission:view')
  getRolePermissions(@Param('role') role: UserRole) {
    if (!Object.values(UserRole).includes(role)) {
      throw new BadRequestException('نقش نامعتبر است');
    }
    return this.adminPermissionsService.getRolePermissions(role);
  }

  // ============================================================
  // ۳. اختصاص یک دسترسی به نقش
  // ============================================================
  @Post('assign')
  @Permissions('permission:manage')
  assignPermissionToRole(
    @Body() body: { role: UserRole; action: string },
    @CurrentUser() actor: CurrentUserPayload,
  ) {
    if (!Object.values(UserRole).includes(body.role)) {
      throw new BadRequestException('نقش نامعتبر است');
    }
    return this.adminPermissionsService.assignPermissionToRole(
      body.role,
      body.action,
      actor.userId,
    );
  }

  // ============================================================
  // ۴. حذف یک دسترسی از نقش
  // ============================================================
  @Delete('revoke')
  @Permissions('permission:manage')
  revokePermissionFromRole(
    @Body() body: { role: UserRole; action: string },
    @CurrentUser() actor: CurrentUserPayload,
  ) {
    if (!Object.values(UserRole).includes(body.role)) {
      throw new BadRequestException('نقش نامعتبر است');
    }
    return this.adminPermissionsService.revokePermissionFromRole(
      body.role,
      body.action,
      actor.userId,
    );
  }

  // ============================================================
  // ۵. ایجاد دسترسی جدید
  // ============================================================
  @Post('create')
  @Permissions('permission:manage')
  createPermission(
    @Body() body: { action: string; description?: string },
  ) {
    if (!body.action || body.action.trim() === '') {
      throw new BadRequestException('نام دسترسی الزامی است');
    }
    return this.adminPermissionsService.createPermission(
      body.action,
      body.description,
    );
  }

  // ============================================================
  // ۶. حذف دسترسی
  // ============================================================
  @Delete(':action')
  @Permissions('permission:manage')
  deletePermission(@Param('action') action: string) {
    return this.adminPermissionsService.deletePermission(action);
  }

  // ============================================================
  // ✅ ۷. Bulk Assign Permissions به یک نقش
  // ============================================================
  @Post('bulk-assign')
  @Permissions('permission:manage')
  async bulkAssignPermissions(
    @Body() body: { role: UserRole; actions: string[] },
    @CurrentUser() actor: CurrentUserPayload,
  ) {
    if (!Object.values(UserRole).includes(body.role)) {
      throw new BadRequestException('نقش نامعتبر است');
    }
    if (!body.actions || body.actions.length === 0) {
      throw new BadRequestException('حداقل یک دسترسی باید انتخاب شود');
    }
    return this.adminPermissionsService.bulkAssignPermissionsToRole(
      body.role,
      body.actions,
      actor.userId,
    );
  }

  // ============================================================
  // ✅ ۸. Bulk Revoke Permissions از یک نقش
  // ============================================================
  @Post('bulk-revoke')
  @Permissions('permission:manage')
  async bulkRevokePermissions(
    @Body() body: { role: UserRole; actions: string[] },
    @CurrentUser() actor: CurrentUserPayload,
  ) {
    if (!Object.values(UserRole).includes(body.role)) {
      throw new BadRequestException('نقش نامعتبر است');
    }
    if (!body.actions || body.actions.length === 0) {
      throw new BadRequestException('حداقل یک دسترسی باید انتخاب شود');
    }
    return this.adminPermissionsService.bulkRevokePermissionsFromRole(
      body.role,
      body.actions,
      actor.userId,
    );
  }

  // ============================================================
  // ✅ ۹. دریافت وضعیت کامل دسترسی‌های یک نقش
  // ============================================================
  @Get('roles/:role/with-details')
  @Permissions('permission:view')
  async getRolePermissionsWithDetails(@Param('role') role: UserRole) {
    if (!Object.values(UserRole).includes(role)) {
      throw new BadRequestException('نقش نامعتبر است');
    }
    return this.adminPermissionsService.getRolePermissionsWithDetails(role);
  }
}
