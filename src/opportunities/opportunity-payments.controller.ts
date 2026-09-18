import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { CreateOpportunityPaymentDto } from './dto/create-opportunity-payment.dto';
import { FindOpportunityPaymentsDto } from './dto/find-opportunity-payments.dto';
import { MarkPaymentPaidDto } from './dto/mark-payment-paid.dto';
import { UpdateOpportunityPaymentDto } from './dto/update-opportunity-payment.dto';
import { OpportunityPaymentsService } from './opportunity-payments.service';

@Controller('opportunities/:opportunityId/payments')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OpportunityPaymentsController {
  constructor(private readonly service: OpportunityPaymentsService) {}

  @Get()
  @Permissions('payment:view')
  findAll(
    @Param('opportunityId') opportunityId: string,
    @Query() query: FindOpportunityPaymentsDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.findAll(opportunityId, query, user);
  }

  @Post()
  @Permissions('payment:manage')
  create(
    @Param('opportunityId') opportunityId: string,
    @Body() dto: CreateOpportunityPaymentDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.create(opportunityId, dto, user);
  }

  @Get(':paymentId')
  @Permissions('payment:view')
  findOne(
    @Param('opportunityId') opportunityId: string,
    @Param('paymentId') paymentId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.findOne(opportunityId, paymentId, user);
  }

  @Patch(':paymentId')
  @Permissions('payment:manage')
  update(
    @Param('opportunityId') opportunityId: string,
    @Param('paymentId') paymentId: string,
    @Body() dto: UpdateOpportunityPaymentDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(opportunityId, paymentId, dto, user);
  }

  @Patch(':paymentId/mark-paid')
  @Permissions('payment:manage')
  markPaid(
    @Param('opportunityId') opportunityId: string,
    @Param('paymentId') paymentId: string,
    @Body() dto: MarkPaymentPaidDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.markPaid(opportunityId, paymentId, dto, user);
  }

  @Patch(':paymentId/cancel')
  @Permissions('payment:manage')
  cancel(
    @Param('opportunityId') opportunityId: string,
    @Param('paymentId') paymentId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.cancel(opportunityId, paymentId, user);
  }

  @Delete(':paymentId')
  @Permissions('payment:manage')
  remove(
    @Param('opportunityId') opportunityId: string,
    @Param('paymentId') paymentId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.remove(opportunityId, paymentId, user);
  }
}