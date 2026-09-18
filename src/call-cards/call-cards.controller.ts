import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { CallCardsService } from './call-cards.service';
import { UpsertCallCardDto } from './dto/upsert-call-card.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('companies/:companyId/call-card')
export class CallCardsController {
  constructor(private callCardsService: CallCardsService) {}

  @Get()
  @Permissions('call-card:view')
  find(
    @Param('companyId') companyId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.callCardsService.findByCompany(companyId, user);
  }

  @Get('suggest')
  @Permissions('call-card:view')
  suggest(
    @Param('companyId') companyId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.callCardsService.suggest(companyId, user);
  }

  @Put()
  @Permissions('call-card:manage')
  upsert(
    @Param('companyId') companyId: string,
    @Body() dto: UpsertCallCardDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.callCardsService.upsert(companyId, dto, user);
  }
}