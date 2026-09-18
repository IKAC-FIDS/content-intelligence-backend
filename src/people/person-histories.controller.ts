import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { CreatePersonEducationHistoryDto, CreatePersonEmploymentHistoryDto, CreatePersonEmploymentPositionDto, UpdatePersonEducationHistoryDto, UpdatePersonEmploymentHistoryDto, UpdatePersonEmploymentPositionDto } from './dto/person-history.dto';
import { PersonHistoriesService } from './person-histories.service';
@Controller('people/:personId') @UseGuards(JwtAuthGuard, PermissionsGuard)
export class PersonHistoriesController {
 constructor(private readonly service: PersonHistoriesService) {}
 @Get('employment-history') @Permissions('person:view') employment(@Param('personId') p:string,@CurrentUser()u:CurrentUserPayload){return this.service.findEmployment(p,u)}
 @Post('employment-history') @Permissions('person:update') createEmployment(@Param('personId')p:string,@Body()d:CreatePersonEmploymentHistoryDto,@CurrentUser()u:CurrentUserPayload){return this.service.createEmployment(p,d,u)}
 @Patch('employment-history/:employmentId') @Permissions('person:update') updateEmployment(@Param('personId')p:string,@Param('employmentId')e:string,@Body()d:UpdatePersonEmploymentHistoryDto,@CurrentUser()u:CurrentUserPayload){return this.service.updateEmployment(p,e,d,u)}
 @Delete('employment-history/:employmentId') @Permissions('person:update') removeEmployment(@Param('personId')p:string,@Param('employmentId')e:string,@CurrentUser()u:CurrentUserPayload){return this.service.removeEmployment(p,e,u)}
 @Post('employment-history/:employmentId/positions') @Permissions('person:update') createPosition(@Param('personId')p:string,@Param('employmentId')e:string,@Body()d:CreatePersonEmploymentPositionDto,@CurrentUser()u:CurrentUserPayload){return this.service.createPosition(p,e,d,u)}
 @Patch('employment-history/:employmentId/positions/:positionId') @Permissions('person:update') updatePosition(@Param('personId')p:string,@Param('employmentId')e:string,@Param('positionId')i:string,@Body()d:UpdatePersonEmploymentPositionDto,@CurrentUser()u:CurrentUserPayload){return this.service.updatePosition(p,e,i,d,u)}
 @Delete('employment-history/:employmentId/positions/:positionId') @Permissions('person:update') removePosition(@Param('personId')p:string,@Param('employmentId')e:string,@Param('positionId')i:string,@CurrentUser()u:CurrentUserPayload){return this.service.removePosition(p,e,i,u)}
 @Get('education-history') @Permissions('person:view') education(@Param('personId')p:string,@CurrentUser()u:CurrentUserPayload){return this.service.findEducation(p,u)}
 @Post('education-history') @Permissions('person:update') createEducation(@Param('personId')p:string,@Body()d:CreatePersonEducationHistoryDto,@CurrentUser()u:CurrentUserPayload){return this.service.createEducation(p,d,u)}
 @Patch('education-history/:educationId') @Permissions('person:update') updateEducation(@Param('personId')p:string,@Param('educationId')e:string,@Body()d:UpdatePersonEducationHistoryDto,@CurrentUser()u:CurrentUserPayload){return this.service.updateEducation(p,e,d,u)}
 @Delete('education-history/:educationId') @Permissions('person:update') removeEducation(@Param('personId')p:string,@Param('educationId')e:string,@CurrentUser()u:CurrentUserPayload){return this.service.removeEducation(p,e,u)}
}
