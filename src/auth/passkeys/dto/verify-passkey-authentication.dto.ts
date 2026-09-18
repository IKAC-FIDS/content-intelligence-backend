import { IsNotEmpty, IsObject, IsString } from 'class-validator';

export class VerifyPasskeyAuthenticationDto {
  @IsString()
  @IsNotEmpty()
  challengeId: string;

  @IsObject()
  response: Record<string, unknown>;
}
