import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SwitchTenantDto {
  @IsUUID()
  @ApiProperty({ format: 'uuid', example: '11111111-1111-4111-8111-111111111111' })
  organizationId!: string;
}
