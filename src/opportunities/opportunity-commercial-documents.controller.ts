import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
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
import { ChangeCommercialDocumentStatusDto } from './dto/change-commercial-document-status.dto';
import { CreateCommercialDocumentDto } from './dto/create-commercial-document.dto';
import { FindCommercialDocumentsDto } from './dto/find-commercial-documents.dto';
import { UpdateCommercialDocumentDto } from './dto/update-commercial-document.dto';
import { UploadCommercialDocumentDto } from './dto/upload-commercial-document.dto';
import { OpportunityCommercialDocumentsService } from './opportunity-commercial-documents.service';

@Controller('opportunities/:opportunityId/commercial-documents')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OpportunityCommercialDocumentsController {
  constructor(
    private readonly service: OpportunityCommercialDocumentsService,
  ) {}

  @Get()
  @Permissions('commercial-document:view')
  findAll(
    @Param('opportunityId') opportunityId: string,
    @Query() query: FindCommercialDocumentsDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.findAll(opportunityId, query, user);
  }

  @Post()
  @Permissions('commercial-document:manage')
  create(
    @Param('opportunityId') opportunityId: string,
    @Body() dto: CreateCommercialDocumentDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.create(opportunityId, dto, user);
  }

  @Post('upload')
  @Permissions('commercial-document:manage')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 25 * 1024 * 1024,
      },
    }),
  )
  createWithFile(
    @Param('opportunityId') opportunityId: string,
    @Body() dto: UploadCommercialDocumentDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.createWithFile(opportunityId, dto, file, user);
  }

  @Get(':documentId')
  @Permissions('commercial-document:view')
  findOne(
    @Param('opportunityId') opportunityId: string,
    @Param('documentId') documentId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.findOne(opportunityId, documentId, user);
  }

  @Patch(':documentId')
  @Permissions('commercial-document:manage')
  update(
    @Param('opportunityId') opportunityId: string,
    @Param('documentId') documentId: string,
    @Body() dto: UpdateCommercialDocumentDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(opportunityId, documentId, dto, user);
  }

  @Patch(':documentId/status')
  @Permissions('commercial-document:manage')
  changeStatus(
    @Param('opportunityId') opportunityId: string,
    @Param('documentId') documentId: string,
    @Body() dto: ChangeCommercialDocumentStatusDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.changeStatus(opportunityId, documentId, dto, user);
  }

  @Delete(':documentId')
  @Permissions('commercial-document:manage')
  remove(
    @Param('opportunityId') opportunityId: string,
    @Param('documentId') documentId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.remove(opportunityId, documentId, user);
  }
}
