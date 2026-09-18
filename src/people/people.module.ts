import { Module } from '@nestjs/common';
import { PeopleService } from './people.service';
import { PeopleController } from './people.controller';
import { PersonHistoriesController } from './person-histories.controller';
import { PersonHistoriesService } from './person-histories.service';

@Module({
  providers: [PeopleService, PersonHistoriesService],
  controllers: [PeopleController, PersonHistoriesController],
})
export class PeopleModule {}
