import { IsOptional, IsString } from 'class-validator';
export class CompleteMeetingDto { @IsOptional() @IsString() completionNote?: string; }
