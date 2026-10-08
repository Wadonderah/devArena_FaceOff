import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser, Roles, type AuthenticatedUser } from '../common/decorators';
import { CreateAnnouncementDto } from './dto/announcement.dto';
import { NotificationsService } from './notifications.service';

/// A participant's own notifications.
///
/// Authenticated by the global JwtAuthGuard, and there is no `@Roles` here on
/// purpose: every role has a bell. The caller's id comes from the verified
/// token via `@CurrentUser`, never from a parameter, so there is no route shape
/// in which one account can name another.
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @CurrentUser('id') userId: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('before', new ParseUUIDPipe({ optional: true })) before?: string,
  ) {
    return this.notifications.list(userId, { limit, before });
  }

  /// The bell polls this on a timer, so it is deliberately the cheapest route
  /// in the app: one indexed COUNT, no rows returned.
  @Get('unread-count')
  async unreadCount(@CurrentUser('id') userId: string) {
    return { unreadCount: await this.notifications.unreadCount(userId) };
  }

  @Post(':id/read')
  markRead(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.markRead(userId, id);
  }

  @Post('read-all')
  markAllRead(@CurrentUser('id') userId: string) {
    return this.notifications.markAllRead(userId);
  }
}

/// Staff only. Separate controller so the participant routes above carry no
/// role metadata at all and cannot inherit it by accident.
@Controller('admin/announcements')
@Roles(Role.ORGANIZER)
export class AnnouncementsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post()
  create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateAnnouncementDto) {
    return this.notifications.announce(actor, dto);
  }
}
