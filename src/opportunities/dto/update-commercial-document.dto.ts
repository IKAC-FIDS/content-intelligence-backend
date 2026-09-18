import { PartialType } from '@nestjs/mapped-types';
import { CreateCommercialDocumentDto } from './create-commercial-document.dto';

export class UpdateCommercialDocumentDto extends PartialType(
  CreateCommercialDocumentDto,
) {}