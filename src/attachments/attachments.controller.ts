import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
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
import {
  CurrentUser,
  CurrentUserPayload,
} from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { AttachmentsService } from './attachments.service';
import { FindAttachmentsDto } from './dto/find-attachments.dto';
import { UploadAttachmentDto } from './dto/upload-attachment.dto';

@Controller('attachments')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AttachmentsController {
  constructor(private readonly service: AttachmentsService) {}

  @Get()
  @Permissions('attachment:view')
  findAll(
    @Query() query: FindAttachmentsDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.findAll(query, user);
  }

  @Post()
  @Permissions('attachment:manage')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 25 * 1024 * 1024,
      },
    }),
  )
  upload(
    @Body() dto: UploadAttachmentDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.upload(dto, file, user);
  }

  @Get(':id')
  @Permissions('attachment:view')
  findOne(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.findOne(id, user);
  }

  @Get(':id/download')
  @Permissions('attachment:view')
  async download(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { attachment, stream } = await this.service.getDownloadStream(id, user);

    const downloadName = attachment.originalFileName || attachment.name || 'artifact';
    const safeFileName = this.safeContentDispositionFileName(downloadName);
    const encodedFileName = encodeURIComponent(downloadName)
      .replace(/['()]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
      .replace(/\*/g, '%2A');

    response.setHeader('Content-Type', attachment.mimeType || 'application/octet-stream');
    if (attachment.sizeBytes !== null)
      response.setHeader('Content-Length', String(attachment.sizeBytes));
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeFileName}"; filename*=UTF-8''${encodedFileName}`,
    );

    return new StreamableFile(stream);
  }

  @Delete(':id')
  @Permissions('attachment:manage')
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.remove(id, user);
  }

  private safeContentDispositionFileName(fileName: string) {
    const sanitized = fileName
      .replace(/["\\\r\n]/g, '_')
      .replace(/[^\x20-\x7E]/g, '_')
      .trim();

    return sanitized || 'attachment';
  }
}
