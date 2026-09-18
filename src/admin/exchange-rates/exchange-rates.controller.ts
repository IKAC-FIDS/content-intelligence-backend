import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { CreateExchangeRateDto } from './dto/create-exchange-rate.dto';
import { FindExchangeRatesDto } from './dto/find-exchange-rates.dto';
import { ExchangeRatesService } from './exchange-rates.service';
@Controller('admin/exchange-rates') @UseGuards(JwtAuthGuard, PermissionsGuard)
export class ExchangeRatesController {
  constructor(private readonly service: ExchangeRatesService) {}
  @Get('current') @Permissions('exchange-rate:view', 'financial:view') current() { return this.service.current(); }
  @Get() @Permissions('exchange-rate:view', 'financial:view') findAll(@Query() query: FindExchangeRatesDto) { return this.service.findAll(query); }
  @Post() @Permissions('exchange-rate:manage', 'financial:view') create(@Body() dto: CreateExchangeRateDto, @CurrentUser() user: CurrentUserPayload) { return this.service.create(dto, user); }
}
