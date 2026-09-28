import { Module } from '@nestjs/common';
import { PlatformAuthorityModule } from '../platform-authority/platform-authority.module';
import { LanguagesController, PlatformLanguagesController } from './languages.controller';
import { LanguagesService } from './languages.service';

@Module({ imports: [PlatformAuthorityModule], controllers: [LanguagesController, PlatformLanguagesController], providers: [LanguagesService], exports: [LanguagesService] })
export class LanguagesModule {}
