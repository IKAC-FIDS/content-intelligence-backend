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
import { PersonContactsService } from './person-contacts.service';
import { CreatePersonContactDto, UpdatePersonContactDto } from '../people/dto/person-contact.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('people/:personId/contacts')
export class PersonContactsController {
  constructor(private contactsService: PersonContactsService) {}

  @Post()
  @Permissions('person:update')
  create(
    @Param('personId') personId: string,
    @Body() dto: CreatePersonContactDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.contactsService.create(personId, dto, user);
  }

  @Get()
  @Permissions('person:view')
  findAll(
    @Param('personId') personId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.contactsService.findByPerson(personId, user);
  }

  @Get(':id')
  @Permissions('person:view')
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.contactsService.findOne(id, user);
  }

  @Patch(':id')
  @Permissions('person:update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePersonContactDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.contactsService.update(id, dto, user);
  }

  @Delete(':id')
  @Permissions('person:update')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.contactsService.remove(id, user);
  }
}
