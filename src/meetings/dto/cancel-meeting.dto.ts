import { IsOptional, IsString } from 'class-validator';
export class CancelMeetingDto { @IsOptional() @IsString() cancellationReason?: string; }
