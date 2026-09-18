import { Module } from '@nestjs/common';
import { SsoModule } from '../auth/sso/sso.module';
import { EmailController } from './email.controller';
import { EmailService } from './email.service';

@Module({ imports: [SsoModule], controllers: [EmailController], providers: [EmailService], exports: [EmailService] })
export class EmailModule {}
