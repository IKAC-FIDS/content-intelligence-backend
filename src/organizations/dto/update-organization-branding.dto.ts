import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Matches,
} from "class-validator";

const color = /^#[0-9A-Fa-f]{6}$/;

export class UpdateOrganizationBrandingDto {
  @IsOptional() @IsString() @MaxLength(120) displayTitle?: string | null;
  @IsOptional() @Matches(color) primaryColor?: string | null;
  @IsOptional() @Matches(color) secondaryColor?: string | null;
  @IsOptional() @Matches(color) accentColor?: string | null;
  @IsOptional() @IsUUID() logoAttachmentId?: string | null;
  @IsOptional() @IsUUID() faviconAttachmentId?: string | null;
}
