import { Module } from '@nestjs/common';
import { PersonContactsService } from './person-contacts.service';
import { PersonContactsController } from './person-contacts.controller';

@Module({
  providers: [PersonContactsService],
  controllers: [PersonContactsController],
  exports: [PersonContactsService],
})
export class PersonContactsModule {}