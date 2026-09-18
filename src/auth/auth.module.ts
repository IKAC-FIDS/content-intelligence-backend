// src/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { RefreshTokenService } from './refresh-token.service';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';
import { AccountSecurityController } from './account-security.controller';
import { AccountSecurityService } from './account-security.service';
import { OrganizationMembershipsModule } from '../organization-memberships/organization-memberships.module';

@Module({
  imports: [
    PassportModule,
    OrganizationMembershipsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRES_IN') || '15m',
        },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [
    AuthService,
    JwtStrategy,
    RefreshTokenService,
    SessionsService,
    AccountSecurityService,
  ],
  controllers: [
    AuthController,
    SessionsController,
    AccountSecurityController,
  ],
  exports: [
    AuthService,
  ],
})
export class AuthModule {}
