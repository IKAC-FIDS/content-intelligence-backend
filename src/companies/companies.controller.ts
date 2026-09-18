import {
  Body,
  Controller,
  Delete,
  Get,
  GoneException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { PROFILE_MEDIA_MAX_BYTES } from '../profile-media/profile-media.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../common/decorators/current-user.decorator';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { ChangeOwnerDto, BulkChangeOwnerDto } from './dto/change-owner.dto';
import { FindCompaniesDto } from './dto/find-companies.dto';
import { ArchiveCompanyDto } from './dto/archive-company.dto';
import { FindCompanyOptionsDto } from './dto/find-company-options.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('companies')
export class CompaniesController {
  constructor(private companiesService: CompaniesService) {}

  @Get()
  @Permissions('company:view')
  findAll(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: FindCompaniesDto,
  ) {
    return this.companiesService.findAll(user, query, {
      stage: query.stage,
      priority: query.priority,
      industryId: query.industryId,
      industry: query.industry,
      sourceId: query.sourceId,
      source: query.source,
      withoutOwner: query.withoutOwner === 'true',
      search: query.search,
      ownerId: query.ownerId,
      ownershipScope: query.ownershipScope,
      includeArchived: query.includeArchived === 'true',
      archivedOnly: query.archivedOnly === 'true',
    });
  }

  @Get('options')
  @Permissions('company:view')
  findOptions(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: FindCompanyOptionsDto,
  ) {
    return this.companiesService.findOptions(user, query);
  }

  @Get('options/:id')
  @Permissions('company:view')
  findOption(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.companiesService.findOption(id, user);
  }

  @Get(':id')
  @Permissions('company:view')
  findOne(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.companiesService.findOne(id, user);
  }

  @Get(':id/logo')
  @Permissions('company:view')
  async getLogo(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Res({ passthrough: true }) response: Response,
  ) {
    const media = await this.companiesService.getLogo(id, user);
    response.setHeader('Content-Type', media.mimeType);
    response.setHeader('Cache-Control', 'private, max-age=300');
    return new StreamableFile(media.stream);
  }

  @Post(':id/logo')
  @Permissions('company:update')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: PROFILE_MEDIA_MAX_BYTES },
  }))
  uploadLogo(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.companiesService.updateLogo(id, file, user);
  }

  @Delete(':id/logo')
  @Permissions('company:update')
  removeLogo(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.companiesService.removeLogo(id, user);
  }

  @Post()
  @Permissions('company:create')
  create(
    @Body() dto: CreateCompanyDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.companiesService.create(dto, user);
  }

  @Patch(':id')
  @Permissions('company:update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCompanyDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.companiesService.update(id, dto, user);
  }

  @Patch(':id/stage')
  @Permissions('company:view')
  changeStageDeprecated(@Param('id') id: string) {
    throw new GoneException({
      message:
        'Company pipeline mutation is deprecated. Use opportunity pipeline instead.',
      deprecatedEndpoint: `/api/companies/${id}/stage`,
      replacementEndpoint: '/api/opportunities/:id/stage',
      replacementPermission: 'opportunity:change-stage',
    });
  }

  @Patch(':id/archive')
  @Permissions('company:archive')
  archive(
    @Param('id') id: string,
    @Body() dto: ArchiveCompanyDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.companiesService.archive(id, dto, user);
  }

  @Patch(':id/restore')
  @Permissions('company:restore')
  restore(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.companiesService.restore(id, user);
  }

  @Patch('bulk/owner')
  @Permissions('company:bulk-change-owner')
  bulkChangeOwner(
    @Body() dto: BulkChangeOwnerDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.companiesService.bulkChangeOwner(dto, user);
  }

  @Patch(':id/owner')
  @Permissions('company:change-owner')
  changeOwner(
    @Param('id') id: string,
    @Body() dto: ChangeOwnerDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.companiesService.changeOwner(id, dto, user);
  }
}
