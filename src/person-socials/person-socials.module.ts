import { Module } from '@nestjs/common';
import { PersonSocialsService } from './person-socials.service';
import { PersonSocialsController } from './person-socials.controller';

@Module({
  providers: [PersonSocialsService],
  controllers: [PersonSocialsController],
  exports: [PersonSocialsService],
})
export class PersonSocialsModule {}