import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @IsEmail()
  @ApiProperty({ format: 'email', example: 'user@example.test' })
  email!: string;

  @IsString()
  @MinLength(6)
  @ApiProperty({ minLength: 6, writeOnly: true, example: 'SyntheticPassword123!' })
  password!: string;
}
