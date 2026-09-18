import { Module } from '@nestjs/common';
import { AuthModule } from '../auth.module';
import {
  AdminUserPasskeysController,
  AuthPasskeysController,
  MyPasskeysController,
} from './passkeys.controller';
import { PasskeysService } from './passkeys.service';
import { OrganizationMembershipsModule } from '../../organization-memberships/organization-memberships.module';

@Module({
  imports: [AuthModule, OrganizationMembershipsModule],
  controllers: [MyPasskeysController, AuthPasskeysController, AdminUserPasskeysController],
  providers: [PasskeysService],
})
export class PasskeysModule {}
