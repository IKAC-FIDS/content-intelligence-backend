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
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../common/decorators/current-user.decorator';
import { CompanySocialChannelsService } from './company-social-channels.service';
import { CreateCompanySocialChannelDto } from './dto/create-company-social-channel.dto';
import { UpdateCompanySocialChannelDto } from './dto/update-company-social-channel.dto';
import { FindCompanySocialChannelsDto } from './dto/find-company-social-channels.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('companies/:companyId/social-channels')
export class CompanySocialChannelsController {
  constructor(private channelsService: CompanySocialChannelsService) {}

  @Post()
  @Permissions('social-channel:manage')
  create(
    @Param('companyId') companyId: string,
    @Body() dto: CreateCompanySocialChannelDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.channelsService.create(companyId, dto, user);
  }

  @Get()
  @Permissions('company:view')
  findAll(
    @Param('companyId') companyId: string,
    @Query() query: FindCompanySocialChannelsDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.channelsService.findByCompany(companyId, query, user);
  }

  @Get(':id')
  @Permissions('company:view')
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.channelsService.findOne(id, user);
  }

  @Patch(':id')
  @Permissions('social-channel:manage')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCompanySocialChannelDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.channelsService.update(id, dto, user);
  }

  @Delete(':id')
  @Permissions('social-channel:manage')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.channelsService.remove(id, user);
  }
}
