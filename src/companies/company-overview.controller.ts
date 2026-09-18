import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { CompanyOverviewService } from './company-overview.service';

@Controller('companies')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CompanyOverviewController {
  constructor(
    private readonly companyOverviewService: CompanyOverviewService,
  ) {}

  @Get(':id/overview')
  @Permissions('company:view')
  getOverview(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.companyOverviewService.getOverview(id, user);
  }
}
