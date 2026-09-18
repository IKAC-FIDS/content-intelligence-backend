import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { OrganizationMembershipsModule } from '../organization-memberships/organization-memberships.module';
import { QuotaModule } from '../quota/quota.module';
import { ProfileMediaModule } from '../profile-media/profile-media.module';

@Module({
  imports: [OrganizationMembershipsModule, QuotaModule, ProfileMediaModule],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
