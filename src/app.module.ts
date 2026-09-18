import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';

import { AdminPermissionsModule } from './admin/admin-permissions.module';
import { AuditLogModule } from './audit-log/audit-log.module';
import { AuthModule } from './auth/auth.module';
import { PasskeysModule } from './auth/passkeys/passkeys.module';
import { SsoModule } from './auth/sso/sso.module';
import { CustomThrottlerGuard } from './common/guards/custom-throttler.guard';
import { envValidationSchema } from './common/validators/env.validator';
import { EntitlementsModule } from './entitlements/entitlements.module';
import { HealthModule } from './health/health.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { PrismaModule } from './prisma/prisma.module';
import { QuotaModule } from './quota/quota.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: true },
    }),

    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: config.get<number>('THROTTLE_TTL', 60000),
            limit: config.get<number>('THROTTLE_LIMIT', 100),
          },
        ],
      }),
    }),

    ScheduleModule.forRoot(),

    PrismaModule,
    HealthModule,

    AuthModule,
    SsoModule,
    PasskeysModule,

    UsersModule,
    OrganizationsModule,
    AdminPermissionsModule,

    AuditLogModule,
    EntitlementsModule,
    QuotaModule,
  ],

  providers: [
    {
      provide: APP_GUARD,
      useClass: CustomThrottlerGuard,
    },
  ],
})
export class AppModule {}
