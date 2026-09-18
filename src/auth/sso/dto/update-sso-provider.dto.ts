import { PartialType } from '@nestjs/mapped-types';
import { CreateSsoProviderDto } from './create-sso-provider.dto';

export class UpdateSsoProviderDto extends PartialType(CreateSsoProviderDto) {}