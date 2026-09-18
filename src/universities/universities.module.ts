import { Module } from '@nestjs/common';
import { UniversitiesController } from './universities.controller';
import { UniversitiesService } from './universities.service';
@Module({ controllers: [UniversitiesController], providers: [UniversitiesService], exports: [UniversitiesService] })
export class UniversitiesModule {}
