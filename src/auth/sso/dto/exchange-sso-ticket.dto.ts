import { IsString, MinLength } from 'class-validator';

export class ExchangeSsoTicketDto {
  @IsString()
  @MinLength(20)
  ticket!: string;
}