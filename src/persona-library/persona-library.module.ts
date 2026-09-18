import { Module } from '@nestjs/common';
import { PersonaLibraryService } from './persona-library.service';
import { PersonaLibraryController } from './persona-library.controller';

@Module({
  providers: [PersonaLibraryService],
  controllers: [PersonaLibraryController],
})
export class PersonaLibraryModule {}
