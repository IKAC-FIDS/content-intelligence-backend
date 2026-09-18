import { Module } from "@nestjs/common";
import { ReportsModule } from "../reports/reports.module";
import { DashboardController } from "./dashboard.controller";
import { ActivitiesModule } from "../activities/activities.module";
import { DashboardService } from "./dashboard.service";

@Module({
  imports: [ReportsModule, ActivitiesModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
