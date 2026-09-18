import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ConversationEntityType } from '@prisma/client';
import { CurrentUser, CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { CreateConversationMessageDto, FindConversationDto, UpdateConversationMessageDto, UpdateConversationStatusDto } from './dto/conversation.dto';
import { ConversationsService } from './conversations.service';

@Controller('conversations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get(':entityType/:entityId')
  find(@Param('entityType') entityType: ConversationEntityType, @Param('entityId') entityId: string, @Query() query: FindConversationDto, @CurrentUser() user: CurrentUserPayload) {
    return this.conversations.find(entityType, entityId, query, user);
  }

  @Post(':entityType/:entityId/messages')
  createMessage(@Param('entityType') entityType: ConversationEntityType, @Param('entityId') entityId: string, @Body() dto: CreateConversationMessageDto, @CurrentUser() user: CurrentUserPayload) {
    return this.conversations.createMessage(entityType, entityId, dto, user);
  }

  @Post(':entityType/:entityId/read')
  markRead(@Param('entityType') entityType: ConversationEntityType, @Param('entityId') entityId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.conversations.markRead(entityType, entityId, user);
  }

  @Patch('messages/:messageId')
  updateMessage(@Param('messageId') messageId: string, @Body() dto: UpdateConversationMessageDto, @CurrentUser() user: CurrentUserPayload) {
    return this.conversations.updateMessage(messageId, dto, user);
  }

  @Delete('messages/:messageId')
  deleteMessage(@Param('messageId') messageId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.conversations.deleteMessage(messageId, user);
  }

  @Patch(':threadId/status')
  updateStatus(@Param('threadId') threadId: string, @Body() dto: UpdateConversationStatusDto, @CurrentUser() user: CurrentUserPayload) {
    return this.conversations.updateStatus(threadId, dto, user);
  }
}
