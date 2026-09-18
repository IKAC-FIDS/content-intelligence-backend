import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { PROFILE_MEDIA_MAX_BYTES } from '../profile-media/profile-media.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { AnyPermission, Permissions } from '../common/decorators/permissions.decorator';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { FindUsersDto } from './dto/find-users.dto';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { FindOwnerOptionsDto } from './dto/find-owner-options.dto';
import { FindAssigneeOptionsDto } from './dto/find-assignee-options.dto';
import { ResetUserPasswordDto } from './dto/reset-user-password.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  // ============================================================
  // ۱. ایجاد کاربر جدید
  // ============================================================
  @Post()
  @Permissions('user:create')
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: CurrentUserPayload) {
    return this.usersService.create(dto, actor);
  }

  // ============================================================
  // ۲. دریافت لیست کاربران
  // ============================================================
  @Get()
  @Permissions('user:view')
  findAll(@Query() query: FindUsersDto, @CurrentUser() actor: CurrentUserPayload) {
    return this.usersService.findAll(query, actor);
  }

  @Get('owner-options')
  @Permissions('company:assign-owner')
  getOwnerOptions(@CurrentUser() user: CurrentUserPayload) {
    return this.usersService.getOwnerOptions(user);
  }

  @Get('owner-options/v2')
  @Permissions('company:assign-owner')
  findOwnerOptions(
    @Query() query: FindOwnerOptionsDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.usersService.findOwnerOptions(user, query);
  }

  @Get('assignee-options')
  @AnyPermission('meeting:create', 'meeting:update', 'task:create', 'task:update', 'task:assign', 'task:reassign', 'task:create-subtask', 'technical-tender:manage', 'technical-tender:review-technical', 'technical-tender:review-commercial')
  findAssigneeOptions(@Query() query: FindAssigneeOptionsDto, @CurrentUser() user: CurrentUserPayload) {
    return this.usersService.findAssigneeOptions(user, query);
  }

  // ============================================================
  // ۳. دریافت یک کاربر
  // ============================================================
  @Get(':id')
  @Permissions('user:view')
  findOne(@Param('id') id: string, @CurrentUser() actor: CurrentUserPayload) {
    return this.usersService.findOne(id, actor);
  }

  @Get(':id/avatar')
  async getAvatar(
    @Param('id') id: string,
    @CurrentUser() actor: CurrentUserPayload,
    @Res({ passthrough: true }) response: Response,
  ) {
    const media = await this.usersService.getAvatar(id, actor);
    response.setHeader('Content-Type', media.mimeType);
    response.setHeader('Cache-Control', 'private, max-age=300');
    return new StreamableFile(media.stream);
  }

  @Post(':id/avatar')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: PROFILE_MEDIA_MAX_BYTES },
  }))
  uploadAvatar(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() actor: CurrentUserPayload,
  ) {
    return this.usersService.updateAvatar(id, file, actor);
  }

  @Delete(':id/avatar')
  removeAvatar(@Param('id') id: string, @CurrentUser() actor: CurrentUserPayload) {
    return this.usersService.removeAvatar(id, actor);
  }

  // ============================================================
  // ۴. غیرفعال کردن کاربر
  // ============================================================
  @Patch(':id/deactivate')
  @Permissions('user:deactivate')
  deactivate(@Param('id') id: string, @CurrentUser() actor: CurrentUserPayload) {
    return this.usersService.deactivate(id, actor);
  }

  // ============================================================
  // ✅ ۵. فعال‌سازی مجدد کاربر
  // ============================================================
  @Patch(':id/activate')
  @Permissions('user:activate')
  activate(@Param('id') id: string, @CurrentUser() actor: CurrentUserPayload) {
    return this.usersService.activate(id, actor);
  }

  // ============================================================
  // ✅ ۶. تغییر نقش یک کاربر
  // ============================================================
  @Patch(':id/role')
  @Permissions('user:change-role')
  updateUserRole(
    @Param('id') id: string,
    @Body() dto: UpdateUserRoleDto,
    @CurrentUser() actor: CurrentUserPayload,
  ) {
    return this.usersService.updateUserRole(id, dto, actor);
  }

  @Patch(':id/reset-password')
  @Permissions('user:manage')
  resetPassword(
    @Param('id') id: string,
    @Body() dto: ResetUserPasswordDto,
    @CurrentUser() actor: CurrentUserPayload,
  ) {
    return this.usersService.resetPassword(id, dto.newPassword, actor);
  }
}
