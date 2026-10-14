import { Global, Module } from '@nestjs/common';
import { AnnouncementsController, NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

/// Global, like AuditModule and for the same reason: rounds, teams and the
/// grading worker all emit notifications, and making each of them import this
/// module would be three edits that add nothing.
@Global()
@Module({
  controllers: [NotificationsController, AnnouncementsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
