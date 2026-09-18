import { IsString, IsNotEmpty, IsEnum } from 'class-validator';
import { SocialPlatform } from '@prisma/client';

export class CreateCompanySocialChannelDto {
  @IsEnum(SocialPlatform)
  platform!: SocialPlatform;

  @IsString()
  @IsNotEmpty()
  handle!: string;
}