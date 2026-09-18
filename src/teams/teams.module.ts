import { Module } from '@nestjs/common';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';
import { OrganizationMembershipsModule } from '../organization-memberships/organization-memberships.module';

@Module({
  imports: [OrganizationMembershipsModule],
  controllers: [TeamsController],
  providers: [TeamsService],
  exports: [TeamsService],
})
export class TeamsModule {}
