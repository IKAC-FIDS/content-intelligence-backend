import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../common/decorators/current-user.decorator';
import { CompanyBranchesService } from './company-branches.service';
import { CreateCompanyBranchDto } from './dto/create-company-branch.dto';
import { UpdateCompanyBranchDto } from './dto/update-company-branch.dto';
import { FindCompanyBranchesDto } from './dto/find-company-branches.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('companies/:companyId/branches')
export class CompanyBranchesController {
  constructor(private branchesService: CompanyBranchesService) {}

  @Post()
  @Permissions('branch:manage')
  create(
    @Param('companyId') companyId: string,
    @Body() dto: CreateCompanyBranchDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.branchesService.create(companyId, dto, user);
  }

  @Get()
  @Permissions('company:view')
  findAll(
    @Param('companyId') companyId: string,
    @Query() query: FindCompanyBranchesDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.branchesService.findByCompany(companyId, query, user);
  }

  @Get(':id')
  @Permissions('company:view')
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.branchesService.findOne(id, user);
  }

  @Patch(':id')
  @Permissions('branch:manage')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCompanyBranchDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.branchesService.update(id, dto, user);
  }

  @Delete(':id')
  @Permissions('branch:manage')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.branchesService.remove(id, user);
  }
}
