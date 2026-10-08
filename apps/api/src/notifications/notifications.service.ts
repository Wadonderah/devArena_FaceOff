import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { announcement, type NotificationTemplate } from './notification-templates';

export interface NotificationInput extends NotificationTemplate {
  userId: string;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/// One INSERT per chunk. A competition-wide announcement is one row per
/// participant, and a single statement with a few thousand rows in it is where
/// parameter limits and statement timeouts start to matter.
const CHUNK = 500;

/// `dedupeKey` is absent on purpose: it is an internal idempotency device, and
/// exposing it would publish the fan-out scheme to anyone with a browser.
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

  // ── Creation ────────────────────────────────────────────────────────────
  //
  // Every notification in the system is born here. Nothing else calls
  // `prisma.notification.create`. That is the point: when an email channel is
  // added, it attaches to this method and every existing caller gains it
  // without being touched.
  //
  // This one throws. The fan-out helpers below are the forgiving layer — see
  // the note on `dispatch`.

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
        // Paired with the unique on (userId, dedupeKey). This is what makes a
        // repeated fan-out a no-op instead of a duplicate.
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
        // Someone who has been deactivated should not accumulate a bell.
        user: { isActive: true },
      },
      select: { userId: true },
    });

    return this.dispatch(
      participants.map((p) => ({ ...template, userId: p.userId })),
      `competition ${competitionId}`,
    );
  }

  /// Everyone with an active account.
  ///
  /// The one fan-out that is not scoped to a competition. Used for a
  /// competition opening its registration, where the audience cannot be its
  /// participants because there are none yet.
  async notifyAllUsers(
    template: NotificationTemplate,
    options: { exceptUserId?: string; excludeParticipantsOf?: string } = {},
  ): Promise<number> {
    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        ...(options.exceptUserId ? { id: { not: options.exceptUserId } } : {}),
        // "You may now register" is noise for somebody already registered.
        // Reachable because enrolment can predate the REGISTRATION state —
        // a competition can be moved back to DRAFT and forward again.
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

  /// Organizers and administrators. Used for operational alerts, never for
  /// anything a participant generates.
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

  /// Creates, and swallows any failure.
  ///
  /// Same reasoning as AuditService.record: a notification is a side effect of
  /// something more important than itself. An organizer starting a round must
  /// not get a 500 because the fan-out failed, and a grading alert must not
  /// turn a handled failure into an unhandled one. Losing the row is the lesser
  /// harm, and the log line is what makes it recoverable.
  ///
  /// `createMany` stays strict so tests can assert on real failures; only this
  /// edge forgives.
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

  // ── Reads and writes, always scoped to the caller ───────────────────────
  //
  // `userId` is part of every `where` below, never checked afterwards in a
  // conditional. Ownership that is expressed as a query predicate cannot be
  // forgotten on one branch, and a row belonging to someone else is simply not
  // found — which also means the response cannot distinguish "not yours" from
  // "does not exist".

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
      // `id` breaks ties. Two notifications from the same fan-out share a
      // `createdAt` to the millisecond, and an unstable sort would let a cursor
      // skip or repeat rows across pages.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      ...(query.before ? { cursor: { id: query.before }, skip: 1 } : {}),
    });

    return {
      items,
      unreadCount: await this.unreadCount(userId),
      // Only when the page came back full. A short page is the last page, and
      // handing back a cursor there would make the client fetch an empty one.
      nextCursor: items.length === limit ? (items[items.length - 1]?.id ?? null) : null,
    };
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async markRead(userId: string, id: string): Promise<{ read: true }> {
    const { count } = await this.prisma.notification.updateMany({
      // `readAt: null` keeps this idempotent: pressing it twice must not
      // rewrite the timestamp to the later moment.
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });

    if (count === 0) {
      // Nothing was updated, which is either "already read" (fine) or "not
      // yours / no such row" (a 404). Only the miss path pays for the check.
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

  /// An organizer's broadcast.
  ///
  /// The role rule is here rather than on the route because it depends on the
  /// payload, which a `@Roles` decorator cannot see: a competition-scoped
  /// announcement is ordinary organizer work, but one with no `competitionId`
  /// reaches every account on the platform, and that is an administrator's
  /// decision. `Competition` has no owner column, so an organizer cannot be
  /// narrowed to their own events — if that is wanted, the competition needs an
  /// owner first.
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

      // Strict, not dispatched: the sender is watching a form and must be told
      // if nothing went out. The forgiving path is for notifications nobody
      // asked for.
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
