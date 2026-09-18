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
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { PersonSocialsService } from './person-socials.service';
import { CreatePersonSocialDto, UpdatePersonSocialDto } from '../people/dto/person-social.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('people/:personId/socials')
export class PersonSocialsController {
  constructor(private socialsService: PersonSocialsService) {}

  @Post()
  @Permissions('person:update')
  create(
    @Param('personId') personId: string,
    @Body() dto: CreatePersonSocialDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.socialsService.create(personId, dto, user);
  }

  @Get()
  @Permissions('person:view')
  findAll(
    @Param('personId') personId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.socialsService.findByPerson(personId, user);
  }

  @Get(':id')
  @Permissions('person:view')
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.socialsService.findOne(id, user);
  }

  @Patch(':id')
  @Permissions('person:update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePersonSocialDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.socialsService.update(id, dto, user);
  }

  @Delete(':id')
  @Permissions('person:update')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.socialsService.remove(id, user);
  }
}
