import { Body, Controller, Get, Put, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { getCurrentOrganizationId } from '../common/tenant/tenant-scope.util';
import { EmailService } from './email.service';
import { TestEmailDto, UpdateEmailSettingsDto } from './dto/email-settings.dto';

@Controller('admin/email-settings')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class EmailController {
  constructor(private readonly email: EmailService) {}
  @Get() @Permissions('organization:manage') get(@CurrentUser() user: CurrentUserPayload) { return this.email.getSettings(getCurrentOrganizationId(user)); }
  @Put() @Permissions('organization:manage') update(@Body() dto: UpdateEmailSettingsDto, @CurrentUser() user: CurrentUserPayload) { return this.email.updateSettings(getCurrentOrganizationId(user), user.userId, dto); }
  @Post('test') @Permissions('organization:manage') test(@Body() dto: TestEmailDto, @CurrentUser() user: CurrentUserPayload) { return this.email.sendTest(getCurrentOrganizationId(user), user.userId, dto.to); }
}
