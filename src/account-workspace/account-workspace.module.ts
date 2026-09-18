import { Module } from "@nestjs/common";
import { AccountWorkspaceController } from "./account-workspace.controller";
import { AccountWorkspaceService } from "./account-workspace.service";

@Module({
  controllers: [AccountWorkspaceController],
  providers: [AccountWorkspaceService],
})
export class AccountWorkspaceModule {}
