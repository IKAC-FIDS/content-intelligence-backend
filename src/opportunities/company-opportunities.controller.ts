import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { CreateCompanyOpportunityDto } from './dto/create-company-opportunity.dto';
import { FindOpportunitiesDto } from './dto/find-opportunities.dto';
import { OpportunitiesService } from './opportunities.service';

@Controller('companies/:companyId/opportunities')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CompanyOpportunitiesController {
  constructor(private service: OpportunitiesService) {}

  @Get()
  @Permissions('opportunity:view')
  findAll(@Param('companyId') companyId: string, @Query() query: FindOpportunitiesDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.findByCompany(companyId, query, user);
  }

  @Post()
  @Permissions('opportunity:create')
  create(@Param('companyId') companyId: string, @Body() dto: CreateCompanyOpportunityDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.create({ ...dto, companyId }, user);
  }
}
