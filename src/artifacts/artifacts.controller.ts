import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { AnyPermission } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { ArtifactsService } from './artifacts.service';
import { CreateArtifactLinkDto, CreateExternalArtifactDto, FindArtifactsDto, UpdateArtifactDto, UploadArtifactDto } from './dto/artifact.dto';

@Controller('artifacts')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ArtifactsController {
  constructor(private readonly service: ArtifactsService) {}

  @Get() @AnyPermission('artifact:view', 'attachment:view')
  findAll(@Query() query: FindArtifactsDto, @CurrentUser() user: CurrentUserPayload) { return this.service.findAll(query, user); }

  @Post('upload') @AnyPermission('artifact:create', 'attachment:manage')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } }))
  upload(@Body() dto: UploadArtifactDto, @UploadedFile() file: Express.Multer.File, @CurrentUser() user: CurrentUserPayload) { return this.service.upload(dto, file, user); }

  @Post('external') @AnyPermission('artifact:create', 'attachment:manage')
  external(@Body() dto: CreateExternalArtifactDto, @CurrentUser() user: CurrentUserPayload) { return this.service.createExternal(dto, user); }

  @Get(':id') @AnyPermission('artifact:view', 'attachment:view')
  findOne(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) { return this.service.findOne(id, user); }

  @Patch(':id') @AnyPermission('artifact:update', 'attachment:manage')
  update(@Param('id') id: string, @Body() dto: UpdateArtifactDto, @CurrentUser() user: CurrentUserPayload) { return this.service.update(id, dto, user); }

  @Delete(':id') @AnyPermission('artifact:delete', 'attachment:manage')
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) { return this.service.remove(id, user); }

  @Get(':id/links') @AnyPermission('artifact:view', 'attachment:view')
  links(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) { return this.service.links(id, user); }

  @Post(':id/links') @AnyPermission('artifact:link', 'attachment:manage')
  link(@Param('id') id: string, @Body() dto: CreateArtifactLinkDto, @CurrentUser() user: CurrentUserPayload) { return this.service.link(id, dto, user); }

  @Delete(':id/links/:linkId') @AnyPermission('artifact:link', 'attachment:manage')
  unlink(@Param('id') id: string, @Param('linkId') linkId: string, @CurrentUser() user: CurrentUserPayload) { return this.service.unlink(id, linkId, user); }
}
