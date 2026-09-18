import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { PlatformAdminGuard } from './platform-admin.guard';
import { PlatformJwtStrategy } from './platform-jwt.strategy';

@Module({
  imports: [PassportModule],
  providers: [PlatformJwtStrategy, PlatformAdminGuard],
  exports: [PlatformAdminGuard],
})
export class PlatformAuthorityModule {}
