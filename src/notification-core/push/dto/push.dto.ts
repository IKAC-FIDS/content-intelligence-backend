import { Type } from "class-transformer"
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, IsUrl, Max, MaxLength, Min, ValidateNested } from "class-validator"

class PushKeysDto {
  @IsString() @IsNotEmpty() @MaxLength(1000) p256dh!: string
  @IsString() @IsNotEmpty() @MaxLength(1000) auth!: string
}
export class RegisterPushSubscriptionDto {
  @IsUrl({ require_protocol: true, protocols: ["https"] }, { message: "آدرس اشتراک پوش باید HTTPS باشد" }) @MaxLength(4000) endpoint!: string
  @IsOptional() @Type(() => Number) @IsInt() expirationTime?: number | null
  @IsObject() @ValidateNested() @Type(() => PushKeysDto) keys!: PushKeysDto
  @IsOptional() @IsString() @MaxLength(120) label?: string
}
export class UpdatePushSettingsDto {
  @IsString() @IsIn(["WEB_PUSH"]) provider!: string
  @IsOptional() @IsString() @MaxLength(1000) publicKey?: string
  @IsOptional() @IsString() @MaxLength(2000) privateKey?: string
  @IsOptional() @IsBoolean() clearPrivateKey?: boolean
  @IsOptional() @IsString() @MaxLength(500) subject?: string
  @IsBoolean() enabled!: boolean
  @IsOptional() @Type(() => Number) @IsInt() @Min(1000) @Max(60000) timeoutMs?: number
}
export class TestPushDto {
  @IsUUID() recipientUserId!: string
  @IsOptional() @IsString() @MaxLength(200) title?: string
  @IsOptional() @IsString() @MaxLength(1000) body?: string
}
