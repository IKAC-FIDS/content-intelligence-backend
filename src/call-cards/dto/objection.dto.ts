import { IsString, IsNotEmpty } from 'class-validator';

export class ObjectionDto {
  @IsString()
  @IsNotEmpty()
  objection!: string;

  @IsString()
  @IsNotEmpty()
  response!: string;
}