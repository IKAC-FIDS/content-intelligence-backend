import { IsString, IsNotEmpty } from 'class-validator';

export class DiscoveryQuestionDto {
  @IsString()
  @IsNotEmpty()
  question!: string;
}