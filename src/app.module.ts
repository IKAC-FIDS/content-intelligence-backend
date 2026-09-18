import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { envValidationSchema } from './common/validators/env.validator';
import { CustomThrottlerGuard } from './common/guards/custom-throttler.guard';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CompaniesModule } from './companies/companies.module';
import { PeopleModule } from './people/people.module';
import { ActivitiesModule } from './activities/activities.module';
import { CallCardsModule } from './call-cards/call-cards.module';
import { PersonaLibraryModule } from './persona-library/persona-library.module';
import { ReportsModule } from './reports/reports.module';
import { ImportModule } from './import/import.module';
import { CompanyBranchesModule } from './company-branches/company-branches.module';
import { CompanySocialChannelsModule } from './company-social-channels/company-social-channels.module';
import { AdminPermissionsModule } from './admin/admin-permissions.module';
import { PersonContactsModule } from './person-contacts/person-contacts.module';
import { PersonSocialsModule } from './person-socials/person-socials.module';
import { IndustriesModule } from './industries/industries.module';
import { PainPointsModule } from './pain-points/pain-points.module';
import { UseCasesModule } from './use-cases/use-cases.module';
import { LeadSourcesModule } from './lead-sources/lead-sources.module';
import { LookupsModule } from './lookups/lookups.module';
import { PipelineConfigModule } from './admin/pipeline/pipeline-config.module';
import { AuditLogModule } from './audit-log/audit-log.module';
import { OpportunitiesModule } from './opportunities/opportunities.module';
import { PasskeysModule } from './auth/passkeys/passkeys.module';
import { SsoModule } from './auth/sso/sso.module';
import { HealthModule } from './health/health.module';
import { ProductCatalogModule } from './product-catalog/product-catalog.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { TasksModule } from './tasks/tasks.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { TeamsModule } from './teams/teams.module';
import { UniversitiesModule } from './universities/universities.module';
import { CompanyAccessModule } from './companies/company-access.module';
import { ScheduleModule } from '@nestjs/schedule';
import { MeetingsModule } from './meetings/meetings.module';
import { ExchangeRatesModule } from './admin/exchange-rates/exchange-rates.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { EntitlementsModule } from './entitlements/entitlements.module';
import { QuotaModule } from './quota/quota.module';
import { TechnicalCenterModule } from './technical-center/technical-center.module';
import { ArtifactsModule } from './artifacts/artifacts.module';
import { EmailModule } from './email/email.module';
import { NotificationCoreModule } from './notification-core/notification-core.module';
import { ConversationsModule } from './conversations/conversations.module';
import { AccountWorkspaceModule } from './account-workspace/account-workspace.module';

@Module({
  imports: [
    NotificationCoreModule,
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
    HealthModule,
    CompanyAccessModule,
    PrismaModule,
    AuthModule,
    SsoModule,
    UsersModule,
    CompaniesModule,
    PeopleModule,
    ActivitiesModule,
    CallCardsModule,
    PersonaLibraryModule,
    ReportsModule,
    ImportModule,
    CompanyBranchesModule,
    CompanySocialChannelsModule,
    AdminPermissionsModule,
    PersonContactsModule,
    PersonSocialsModule,
    IndustriesModule,
    PainPointsModule,
    UseCasesModule,
    LeadSourcesModule,
    LookupsModule,
    PipelineConfigModule,
    AuditLogModule,
    OpportunitiesModule,
    PasskeysModule,
    ProductCatalogModule,
    AttachmentsModule,
    TasksModule,
    NotificationsModule,
    OrganizationsModule,
    TeamsModule,
    UniversitiesModule,
    MeetingsModule,
    ExchangeRatesModule,
    DashboardModule,
    EntitlementsModule,
    QuotaModule,
    TechnicalCenterModule,
    ArtifactsModule,
    EmailModule,
    ConversationsModule,
    AccountWorkspaceModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: CustomThrottlerGuard,
    },
  ],
})
export class AppModule {}
