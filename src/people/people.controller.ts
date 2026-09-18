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
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { PeopleService } from './people.service';
import { CreatePersonDto } from './dto/create-person.dto';
import { UpdatePersonDto } from './dto/update-person.dto';
import { PaginationDto } from '../common/dto/pagination.dto'; // ← اضافه شد
import { FindPeopleDto } from './dto/find-people.dto';
import { FindPeopleDirectoryDto } from './dto/find-people-directory.dto';


@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('people')
export class PeopleController {
  constructor(private peopleService: PeopleService) {}

  // ============================================================
  // ۱. دریافت مخاطبین یک شرکت (با صفحه‌بندی)
  // ============================================================
  @Get()
  @Permissions('person:view')
  findByCompany(
    @Query() query: FindPeopleDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.peopleService.findByCompany(query.companyId, query, user);
  }

  @Get('directory')
  @Permissions('people:directory:view')
  findDirectory(
    @Query() query: FindPeopleDirectoryDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.peopleService.findDirectory(query, user);
  }

  // ============================================================
  // ۲. دریافت یک مخاطب
  // ============================================================
  @Get(':id')
  @Permissions('person:view')
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.peopleService.findOne(id, user);
  }

  // ============================================================
  // ۳. ایجاد مخاطب جدید
  // ============================================================
  @Post()
  @Permissions('person:create')
  create(
    @Body() dto: CreatePersonDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.peopleService.create(dto, user);
  }

  // ============================================================
  // ۴. ویرایش مخاطب
  // ============================================================
  @Patch(':id')
  @Permissions('person:update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePersonDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.peopleService.update(id, dto, user);
  }

  // ============================================================
  // ۵. حذف مخاطب
  // ============================================================
  @Delete(':id')
  @Permissions('person:delete')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.peopleService.remove(id, user);
  }
}
