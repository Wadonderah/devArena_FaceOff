import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { NotificationType, Role } from '@prisma/client';
import { NotificationsService } from './notifications.service';
import { announcement, roundEnded, roundStarted } from './notification-templates';
import type { PrismaService } from '../prisma/prisma.service';

function makePrisma(over: Record<string, unknown> = {}) {
  const notification = {
    createMany: jest.fn().mockResolvedValue({ count: 1 }),
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    count: jest.fn().mockResolvedValue(0),
    ...(over.notification as object),
  };

  const prisma = {
    notification,
    competitionParticipant: {
      findMany: jest.fn().mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }]),
      ...(over.competitionParticipant as object),
    },
    user: {
      findMany: jest.fn().mockResolvedValue([{ id: 's1' }]),
      ...(over.user as object),
    },
    competition: {
      findUnique: jest.fn().mockResolvedValue({ id: 'c1' }),
      ...(over.competition as object),
    },
  } as unknown as PrismaService;

  return { service: new NotificationsService(prisma), prisma, notification };
}

const ANNOUNCE = announcement('Doors open', 'Registration closes at noon.');

// ── The one that matters most ───────────────────────────────────────────────
//
// Notifications are the first per-user private resource in the app that is
// addressed by its own id in the URL. Every other read is scoped by a
// relationship the caller already has (their team, their submission); here the
// caller hands over an id and the server has to decide. Ownership is expressed
// as part of the `where`, never as an `if` after the fetch, so there is no
// branch on which it can be skipped.
describe('NotificationsService ownership', () => {
  it('refuses to mark another account’s notification read, and changes nothing', async () => {
    // Belongs to u2. updateMany matches nothing because `userId` is in the
    // predicate; findFirst then confirms there is no such row *for this user*.
    const { service, notification } = makePrisma({
      notification: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    });

    await expect(service.markRead('u1', 'n-owned-by-u2')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(notification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 'u1' }) }),
    );
  });

  // A 404 rather than a 403. A 403 would confirm the row exists, which is
  // itself a leak: an id harvested from somewhere could be tested for
  // existence one request at a time.
  it('reports a foreign notification as missing rather than forbidden', async () => {
    const { service } = makePrisma({
      notification: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    });

    await expect(service.markRead('u1', 'n-owned-by-u2')).rejects.toThrow(
      /Notification not found/,
    );
  });

  it('scopes the list to the caller', async () => {
    const { service, notification } = makePrisma();

    await service.list('u1');

    expect(notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1' } }),
    );
    expect(notification.count).toHaveBeenCalledWith({
      where: { userId: 'u1', readAt: null },
    });
  });

  // `dedupeKey` is an internal idempotency device. If it were selected it would
  // be serialised to the browser, publishing the fan-out scheme.
  it('never selects dedupeKey', async () => {
    const { service, notification } = makePrisma();

    await service.list('u1');

    const select = notification.findMany.mock.calls[0][0].select as Record<string, unknown>;
    expect(select).not.toHaveProperty('dedupeKey');
    expect(select).toHaveProperty('title', true);
  });

  it('marks all read only for the caller', async () => {
    const { service, notification } = makePrisma();

    await service.markAllRead('u1');

    expect(notification.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', readAt: null },
      data: { readAt: expect.any(Date) },
    });
  });
});

describe('NotificationsService.markRead idempotency', () => {
  // Pressing an already-read row must not move its timestamp, and must not
  // 404 either: the caller's intent ("make this read") is already satisfied.
  it('succeeds without rewriting a row that was already read', async () => {
    const { service, notification } = makePrisma({
      notification: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findFirst: jest.fn().mockResolvedValue({ id: 'n1' }),
      },
    });

    await expect(service.markRead('u1', 'n1')).resolves.toEqual({ read: true });

    // `readAt: null` in the predicate is what protects the original timestamp.
    expect(notification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ readAt: null }) }),
    );
  });
});

describe('NotificationsService.createMany', () => {
  it('is a no-op for an empty audience', async () => {
    const { service, notification } = makePrisma();

    await expect(service.createMany([])).resolves.toBe(0);
    expect(notification.createMany).not.toHaveBeenCalled();
  });

  // Paired with the unique on (userId, dedupeKey). Without it, a second
  // fan-out for the same event raises a constraint error instead of doing
  // nothing, and the transition that triggered it would look broken.
  it('skips duplicates so a repeated fan-out writes nothing', async () => {
    const { service, notification } = makePrisma();

    await service.createMany([{ ...ANNOUNCE, userId: 'u1', dedupeKey: 'round:r1:started' }]);

    expect(notification.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
  });

  // A platform-wide announcement is one row per account. One statement holding
  // every row is where parameter limits and statement timeouts begin to bite.
  it('chunks a large audience into several statements', async () => {
    const { service, notification } = makePrisma();
    const audience = Array.from({ length: 1100 }, (_, i) => ({
      ...ANNOUNCE,
      userId: `u${i}`,
    }));

    await service.createMany(audience);

    expect(notification.createMany).toHaveBeenCalledTimes(3);
    const sizes = notification.createMany.mock.calls.map(
      (call: [{ data: unknown[] }]) => call[0].data.length,
    );
    expect(sizes).toEqual([500, 500, 100]);
  });
});

describe('NotificationsService fan-out is best effort', () => {
  // Same contract as AuditService.record. A round starting is the important
  // event; telling people about it is the side effect. If the side effect
  // could fail the transition, an organizer would be blocked from starting a
  // round by an unrelated fault.
  it('swallows a failure rather than failing the caller', async () => {
    const { service } = makePrisma({
      notification: { createMany: jest.fn().mockRejectedValue(new Error('db down')) },
    });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(service.notifyCompetition('c1', ANNOUNCE)).resolves.toBe(0);

    jest.restoreAllMocks();
  });

  it('excludes deactivated accounts from a competition fan-out', async () => {
    const { service, prisma } = makePrisma();

    await service.notifyCompetition('c1', ANNOUNCE);

    expect(
      (prisma as unknown as { competitionParticipant: { findMany: jest.Mock } })
        .competitionParticipant.findMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ user: { isActive: true } }),
      }),
    );
  });

  // "You may now register" is noise for somebody already registered. Reachable
  // because enrolment can predate the REGISTRATION state: a competition can be
  // moved back to DRAFT and forward again.
  it('leaves out people already enrolled when told to', async () => {
    const { service, prisma } = makePrisma();

    await service.notifyAllUsers(ANNOUNCE, {
      exceptUserId: 'o1',
      excludeParticipantsOf: 'c1',
    });

    expect((prisma as unknown as { user: { findMany: jest.Mock } }).user.findMany)
      .toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isActive: true,
            id: { not: 'o1' },
            participations: { none: { competitionId: 'c1' } },
          }),
        }),
      );
  });

  it('reaches every active account when no exclusions are given', async () => {
    const { service, prisma } = makePrisma();

    await service.notifyAllUsers(ANNOUNCE);

    expect((prisma as unknown as { user: { findMany: jest.Mock } }).user.findMany)
      .toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }));
  });

  it('alerts organizers and administrators, and nobody else', async () => {
    const { service, prisma } = makePrisma();

    await service.notifyStaff(ANNOUNCE);

    expect(
      (prisma as unknown as { user: { findMany: jest.Mock } }).user.findMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { role: { in: [Role.ORGANIZER, Role.SUPER_ADMIN] }, isActive: true },
      }),
    );
  });
});

describe('NotificationsService.announce', () => {
  // The role rule cannot live on the route: whether this is ordinary organizer
  // work or a platform-wide broadcast depends on the body, which a @Roles
  // decorator cannot see.
  it('refuses a platform-wide announcement from an organizer', async () => {
    const { service, notification } = makePrisma();

    await expect(
      service.announce(
        { id: 'o1', role: Role.ORGANIZER },
        { title: 'Everyone', body: 'Listen up' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(notification.createMany).not.toHaveBeenCalled();
  });

  it('allows a platform-wide announcement from an administrator', async () => {
    const { service } = makePrisma({
      notification: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    });

    await expect(
      service.announce(
        { id: 'a1', role: Role.SUPER_ADMIN },
        { title: 'Everyone', body: 'Listen up' },
      ),
    ).resolves.toEqual({ sent: 1, audience: 'platform' });
  });

  it('lets an organizer announce to a competition', async () => {
    const { service } = makePrisma({
      notification: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
    });

    await expect(
      service.announce(
        { id: 'o1', role: Role.ORGANIZER },
        { title: 'Round two', body: 'Starts in ten minutes', competitionId: 'c1' },
      ),
    ).resolves.toEqual({ sent: 2, audience: 'competition' });
  });

  // Otherwise the sender's own bell lights up the moment they press send,
  // which reads as a bug.
  it('excludes the sender from their own announcement', async () => {
    const { service, prisma } = makePrisma();

    await service.announce(
      { id: 'o1', role: Role.ORGANIZER },
      { title: 'Round two', body: 'Soon', competitionId: 'c1' },
    );

    expect(
      (prisma as unknown as { competitionParticipant: { findMany: jest.Mock } })
        .competitionParticipant.findMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: { not: 'o1' } }),
      }),
    );
  });

  it('rejects an announcement to a competition that does not exist', async () => {
    const { service } = makePrisma({
      competition: { findUnique: jest.fn().mockResolvedValue(null) },
    });

    await expect(
      service.announce(
        { id: 'o1', role: Role.ORGANIZER },
        { title: 'Hi', body: 'There', competitionId: 'c-missing' },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  // Unlike the system notifications, this one is strict: the sender is looking
  // at a form and must be told if nothing went out.
  it('propagates a write failure to the sender', async () => {
    const { service } = makePrisma({
      notification: { createMany: jest.fn().mockRejectedValue(new Error('db down')) },
    });

    await expect(
      service.announce(
        { id: 'o1', role: Role.ORGANIZER },
        { title: 'Hi', body: 'There', competitionId: 'c1' },
      ),
    ).rejects.toThrow('db down');
  });
});

describe('notification templates', () => {
  const round = { id: 'r1', name: 'Bug Hunt', type: 'DEBUGGING' as const, competitionId: 'c1' };

  // There is no `/rounds/<id>` index page, only the three type-specific ones,
  // so the type has to pick the path or the link 404s.
  it('links a started round to the page for its type', () => {
    expect(roundStarted(round, 'Season 1').linkUrl).toBe('/rounds/r1/debugging');
    expect(roundStarted({ ...round, type: 'MCQ' }, 'Season 1').linkUrl).toBe('/rounds/r1/mcq');
    expect(roundStarted({ ...round, type: 'CODING' }, 'Season 1').linkUrl).toBe(
      '/rounds/r1/coding',
    );
  });

  // The round page is a dead end once it has closed; the standings are what
  // the reader actually wants.
  it('links an ended round to the standings', () => {
    expect(roundEnded(round, 'Season 1').linkUrl).toBe('/leaderboard/c1');
  });

  // Resuming a paused round transitions to LIVE a second time. These keys are
  // what stops that being a second notification.
  it('gives start and end distinct, stable dedupe keys', () => {
    expect(roundStarted(round, 'Season 1').dedupeKey).toBe('round:r1:started');
    expect(roundEnded(round, 'Season 1').dedupeKey).toBe('round:r1:ended');
  });

  // An organizer who sends the same reminder twice means to.
  it('leaves an announcement undeduplicated', () => {
    expect(announcement('Title', 'Body').dedupeKey).toBeNull();
    expect(announcement('Title', 'Body').type).toBe(NotificationType.ANNOUNCEMENT);
  });

  it('keeps every link app-relative', () => {
    const links = [
      roundStarted(round, 'S1').linkUrl,
      roundEnded(round, 'S1').linkUrl,
      announcement('T', 'B', 'c1').linkUrl,
    ];

    for (const link of links) expect(link).toMatch(/^\//);
  });
});
