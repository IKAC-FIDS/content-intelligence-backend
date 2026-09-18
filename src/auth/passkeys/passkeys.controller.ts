import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { StartPasskeyAuthenticationDto } from './dto/start-passkey-authentication.dto';
import { StartPasskeyRegistrationDto } from './dto/start-passkey-registration.dto';
import { VerifyPasskeyAuthenticationDto } from './dto/verify-passkey-authentication.dto';
import { VerifyPasskeyRegistrationDto } from './dto/verify-passkey-registration.dto';
import { PasskeysService } from './passkeys.service';
import { CookieOriginGuard } from '../../common/guards/cookie-origin.guard';

@UseGuards(JwtAuthGuard)
@Controller('me/passkeys')
export class MyPasskeysController {
  constructor(private passkeysService: PasskeysService) {}

  @Get()
  list(@CurrentUser() user: CurrentUserPayload) {
    return this.passkeysService.listMine(user);
  }

  @Post('registration/options')
  @HttpCode(HttpStatus.OK)
  startRegistration(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: StartPasskeyRegistrationDto,
  ) {
    return this.passkeysService.startRegistration(user, dto);
  }

  @Post('registration/verify')
  @HttpCode(HttpStatus.OK)
  verifyRegistration(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: VerifyPasskeyRegistrationDto,
  ) {
    return this.passkeysService.verifyRegistration(user, dto);
  }

  @Delete(':id')
  delete(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.passkeysService.deleteMine(user, id);
  }
}

@Controller('auth/passkeys')
@UseGuards(CookieOriginGuard)
export class AuthPasskeysController {
  constructor(private passkeysService: PasskeysService) {}

  @Post('authentication/options')
  @HttpCode(HttpStatus.OK)
  startAuthentication(@Body() _dto: StartPasskeyAuthenticationDto) {
    return this.passkeysService.startAuthentication();
  }

  @Post('authentication/verify')
  @HttpCode(HttpStatus.OK)
  verifyAuthentication(@Body() dto: VerifyPasskeyAuthenticationDto) {
    return this.passkeysService.verifyAuthentication(dto);
  }
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('admin/users/:id/passkeys')
export class AdminUserPasskeysController {
  constructor(private passkeysService: PasskeysService) {}

  @Get()
  @Permissions('user:passkey:view')
  listForUser(@Param('id') id: string) {
    return this.passkeysService.listForUser(id);
  }

  @Delete(':passkeyId')
  @Permissions('user:passkey:manage')
  deleteForUser(
    @Param('id') id: string,
    @Param('passkeyId') passkeyId: string,
    @CurrentUser() actor: CurrentUserPayload,
  ) {
    return this.passkeysService.adminDelete(id, passkeyId, actor.userId);
  }
}
