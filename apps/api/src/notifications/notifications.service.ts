import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { announcement, type NotificationTemplate } from './notification-templates';

export interface NotificationInput extends NotificationTemplate {
  userId: string;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/// Rows per INSERT. A platform-wide announcement is one row per account, and
/// one statement holding all of them hits parameter limits.
const CHUNK = 500;

/// `dedupeKey` is absent on purpose — it is internal.
const LIST_SELECT = {
  id: true,
  type: true,
  title: true,
  body: true,
  linkUrl: true,
  metadata: true,
  readAt: true,
  createdAt: true,
} satisfies Prisma.NotificationSelect;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Every notification is created here; nothing else calls
  // `prisma.notification.create`. An email channel attaches here and every
  // caller gains it. This throws — the fan-out helpers below forgive.

  async createMany(inputs: NotificationInput[]): Promise<number> {
    if (inputs.length === 0) return 0;

    let created = 0;

    for (let i = 0; i < inputs.length; i += CHUNK) {
      const { count } = await this.prisma.notification.createMany({
        data: inputs.slice(i, i + CHUNK).map((input) => ({
          userId: input.userId,
          type: input.type,
          title: input.title,
          body: input.body,
          linkUrl: input.linkUrl ?? null,
          metadata: input.metadata ?? undefined,
          dedupeKey: input.dedupeKey ?? null,
        })),
        // Paired with the unique on (userId, dedupeKey): a repeated fan-out
        // becomes a no-op rather than a duplicate.
        skipDuplicates: true,
      });
      created += count;
    }

    return created;
  }

  /// Every participant enrolled in a competition.
  async notifyCompetition(
    competitionId: string,
    template: NotificationTemplate,
    options: { exceptUserId?: string } = {},
  ): Promise<number> {
    const participants = await this.prisma.competitionParticipant.findMany({
      where: {
        competitionId,
        ...(options.exceptUserId ? { userId: { not: options.exceptUserId } } : {}),
        user: { isActive: true },
      },
      select: { userId: true },
    });

    return this.dispatch(
      participants.map((p) => ({ ...template, userId: p.userId })),
      `competition ${competitionId}`,
    );
  }

  /// The one fan-out not scoped to a competition — used when a competition
  /// opens for registration and therefore has no participants yet.
  async notifyAllUsers(
    template: NotificationTemplate,
    options: { exceptUserId?: string; excludeParticipantsOf?: string } = {},
  ): Promise<number> {
    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        ...(options.exceptUserId ? { id: { not: options.exceptUserId } } : {}),
        // Enrolment can predate REGISTRATION, so this is reachable.
        ...(options.excludeParticipantsOf
          ? { participations: { none: { competitionId: options.excludeParticipantsOf } } }
          : {}),
      },
      select: { id: true },
    });

    return this.dispatch(
      users.map((u) => ({ ...template, userId: u.id })),
      'all users',
    );
  }

  async notifyUser(userId: string, template: NotificationTemplate): Promise<number> {
    return this.dispatch([{ ...template, userId }], `user ${userId}`);
  }

  /// Operational alerts only, never anything a participant generates.
  async notifyStaff(template: NotificationTemplate): Promise<number> {
    const staff = await this.prisma.user.findMany({
      where: { role: { in: [Role.ORGANIZER, Role.SUPER_ADMIN] }, isActive: true },
      select: { id: true },
    });

    return this.dispatch(
      staff.map((s) => ({ ...template, userId: s.id })),
      'staff',
    );
  }

  /// Swallows failures, like AuditService.record: a notification is a side
  /// effect of something more important, so an organizer must not get a 500
  /// because a fan-out failed. `createMany` stays strict for tests.
  private async dispatch(inputs: NotificationInput[], audience: string): Promise<number> {
    try {
      return await this.createMany(inputs);
    } catch (error) {
      this.logger.error(
        `Failed to notify ${audience} (${inputs[0]?.type}): ${(error as Error).message}`,
      );
      return 0;
    }
  }

  // `userId` is in every `where` below, never checked afterwards in a
  // conditional: ownership expressed as a predicate cannot be forgotten on one
  // branch, and a foreign row is simply not found.

  async list(
    userId: string,
    query: { limit?: number; before?: string } = {},
  ): Promise<{
    items: Prisma.NotificationGetPayload<{ select: typeof LIST_SELECT }>[];
    unreadCount: number;
    nextCursor: string | null;
  }> {
    const limit = Math.min(Math.max(query.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

    const items = await this.prisma.notification.findMany({
      where: { userId },
      select: LIST_SELECT,
      // `id` breaks ties: one fan-out shares a `createdAt` to the millisecond,
      // and an unstable sort makes the cursor skip or repeat rows.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      ...(query.before ? { cursor: { id: query.before }, skip: 1 } : {}),
    });

    return {
      items,
      unreadCount: await this.unreadCount(userId),
      // A short page is the last page.
      nextCursor: items.length === limit ? (items[items.length - 1]?.id ?? null) : null,
    };
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async markRead(userId: string, id: string): Promise<{ read: true }> {
    const { count } = await this.prisma.notification.updateMany({
      // `readAt: null` keeps this idempotent.
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });

    if (count === 0) {
      // Either already read (fine) or not ours (404). Only the miss path pays.
      const owned = await this.prisma.notification.findFirst({
        where: { id, userId },
        select: { id: true },
      });
      if (!owned) throw new NotFoundException('Notification not found');
    }

    return { read: true };
  }

  async markAllRead(userId: string): Promise<{ read: number }> {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });

    return { read: count };
  }

  // ── Announcements ───────────────────────────────────────────────────────

  /// The role rule lives here, not on the route, because it depends on the
  /// payload: without a `competitionId` this reaches every account, which is an
  /// administrator's call. `Competition` has no owner column, so an organizer
  /// cannot be narrowed to their own events.
  async announce(
    actor: { id: string; role: Role },
    input: { title: string; body: string; competitionId?: string },
  ): Promise<{ sent: number; audience: 'competition' | 'platform' }> {
    const template = announcement(input.title, input.body, input.competitionId);

    if (!input.competitionId) {
      if (actor.role !== Role.SUPER_ADMIN) {
        throw new ForbiddenException(
          'Only an administrator can announce to every account. Choose a competition instead.',
        );
      }

      // Strict, not dispatched: the sender is watching a form.
      const users = await this.prisma.user.findMany({
        where: { isActive: true, id: { not: actor.id } },
        select: { id: true },
      });

      const sent = await this.createMany(users.map((u) => ({ ...template, userId: u.id })));
      return { sent, audience: 'platform' };
    }

    const competition = await this.prisma.competition.findUnique({
      where: { id: input.competitionId },
      select: { id: true },
    });

    if (!competition) throw new NotFoundException('Competition not found');

    const participants = await this.prisma.competitionParticipant.findMany({
      where: {
        competitionId: input.competitionId,
        userId: { not: actor.id },
        user: { isActive: true },
      },
      select: { userId: true },
    });

    const sent = await this.createMany(
      participants.map((p) => ({ ...template, userId: p.userId })),
    );

    return { sent, audience: 'competition' };
  }
}
