import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { CompanyLegalDocumentsService } from './company-legal-documents.service';
import {
  UpdateCompanyLegalDocumentDto,
  UploadCompanyLegalDocumentDto,
} from './dto/company-legal-document.dto';
import { FindCompanyLegalDocumentsDto } from './dto/find-company-legal-documents.dto';
import type { Request } from 'express';
import { getRequestId } from '../common/logging/http-log-context';

@Controller('companies/:companyId/legal-documents')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CompanyLegalDocumentsController {
  constructor(private readonly service: CompanyLegalDocumentsService) {}

  @Get()
  @Permissions('company:view')
  findAll(
    @Param('companyId') companyId: string,
    @Query() query: FindCompanyLegalDocumentsDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.findAll(companyId, query, user);
  }

  @Post('upload')
  @Permissions('company:update')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  upload(
    @Param('companyId') companyId: string,
    @Body() dto: UploadCompanyLegalDocumentDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: CurrentUserPayload,
    @Req() req: Request,
  ) {
    return this.service.upload(
      companyId,
      dto,
      file,
      user,
      getRequestId(req),
    );
  }

  @Patch(':documentId')
  @Permissions('company:update')
  update(
    @Param('companyId') companyId: string,
    @Param('documentId') documentId: string,
    @Body() dto: UpdateCompanyLegalDocumentDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(companyId, documentId, dto, user);
  }

  @Delete(':documentId')
  @Permissions('company:update')
  remove(
    @Param('companyId') companyId: string,
    @Param('documentId') documentId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.remove(companyId, documentId, user);
  }
}
