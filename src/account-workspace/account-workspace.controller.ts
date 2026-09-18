import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import {
  CurrentUser,
  CurrentUserPayload,
} from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { AccountWorkspaceService } from "./account-workspace.service";
import { AccountWorkspaceQueryDto } from "./dto/account-workspace-query.dto";

@Controller("account/workspace")
@UseGuards(JwtAuthGuard)
export class AccountWorkspaceController {
  constructor(private readonly service: AccountWorkspaceService) {}

  @Get()
  getWorkspace(
    @Query() query: AccountWorkspaceQueryDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.getWorkspace(query, user);
  }
}
