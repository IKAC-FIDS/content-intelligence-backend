import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { CreateOpportunityLineItemDto } from './dto/create-opportunity-line-item.dto';
import { UpdateOpportunityLineItemDto } from './dto/update-opportunity-line-item.dto';
import { OpportunityLineItemsService } from './opportunity-line-items.service';

@Controller('opportunities/:opportunityId/line-items')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OpportunityLineItemsController {
  constructor(private readonly service: OpportunityLineItemsService) {}

  @Get()
  @Permissions('opportunity-line-item:view')
  findAll(
    @Param('opportunityId') opportunityId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.findAll(opportunityId, user);
  }

  @Post()
  @Permissions('opportunity-line-item:manage')
  create(
    @Param('opportunityId') opportunityId: string,
    @Body() dto: CreateOpportunityLineItemDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.create(opportunityId, dto, user);
  }

  @Get(':lineItemId')
  @Permissions('opportunity-line-item:view')
  findOne(
    @Param('opportunityId') opportunityId: string,
    @Param('lineItemId') lineItemId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.findOne(opportunityId, lineItemId, user);
  }

  @Patch(':lineItemId')
  @Permissions('opportunity-line-item:manage')
  update(
    @Param('opportunityId') opportunityId: string,
    @Param('lineItemId') lineItemId: string,
    @Body() dto: UpdateOpportunityLineItemDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(opportunityId, lineItemId, dto, user);
  }

  @Delete(':lineItemId')
  @Permissions('opportunity-line-item:manage')
  remove(
    @Param('opportunityId') opportunityId: string,
    @Param('lineItemId') lineItemId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.remove(opportunityId, lineItemId, user);
  }
}