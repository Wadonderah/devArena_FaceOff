import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestContext } from '../common/request-context';
import { LeaderboardService } from '../leaderboard/leaderboard.service';
import { AuditService } from '../audit/audit.service';
import { toCsv } from './csv';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leaderboard: LeaderboardService,
    private readonly audit: AuditService,
  ) {}

  async exportResultsCsv(competitionId: string): Promise<{ filename: string; body: string }> {
    const competition = await this.prisma.competition.findUnique({
      where: { id: competitionId },
      select: { id: true, slug: true, name: true },
    });

    if (!competition) throw new NotFoundException('Competition not found');

    const { rows } = await this.leaderboard.forCompetition(competitionId);

    const users = await this.prisma.user.findMany({
      where: { id: { in: rows.map((r) => r.userId) } },
      select: { id: true, email: true },
    });
    const emailById = new Map(users.map((u) => [u.id, u.email]));

    const perRound = await this.prisma.scoreEvent.groupBy({
      by: ['userId', 'roundId'],
      where: { competitionId },
      _sum: { rawScore: true, weightedScore: true },
    });

    const rounds = await this.prisma.round.findMany({
      where: { competitionId },
      orderBy: { orderIndex: 'asc' },
      select: { id: true, name: true },
    });

    const headers = [
      'rank',
      'display_name',
      'email',
      ...rounds.flatMap((r) => [`${r.name} (raw)`, `${r.name} (weighted)`]),
      'final_score',
      'challenges_completed',
      'total_time_ms',
    ];

    const body = rows.map((row) => {
      const roundCells = rounds.flatMap((round) => {
        const entry = perRound.find(
          (p) => p.userId === row.userId && p.roundId === round.id,
        );
        return [
          entry?._sum.rawScore?.toString() ?? '0',
          entry?._sum.weightedScore?.toString() ?? '0',
        ];
      });

      return [
        row.rank,
        row.displayName,
        emailById.get(row.userId) ?? '',
        ...roundCells,
        row.finalScore,
        row.completedChallenges,
        row.totalTimeMs,
      ];
    });

    return {
      filename: `${competition.slug}-results.csv`,
      body: toCsv(headers, body),
    };
  }

  /// One statement rather than five parallel counts.
  ///
  /// The fan-out version needed five pool connections at once, which is exactly
  /// the shape that fails under a small pool — and this endpoint is polled every
  /// ten seconds by the organizer console, so it was the first thing to starve.
  /// Scalar subqueries cost one round trip and cannot exhaust the pool no matter
  /// how it is sized.
  async overview() {
    const [row] = await this.prisma.$queryRaw<
      {
        competitions: bigint;
        participants: bigint;
        submissions: bigint;
        pending: bigint;
        failed: bigint;
        live_rounds: bigint;
      }[]
    >`
      SELECT
        (SELECT count(*) FROM competitions)             AS competitions,
        (SELECT count(*) FROM competition_participants) AS participants,
        (SELECT count(*) FROM submissions)              AS submissions,
        (SELECT count(*) FROM submissions
           WHERE status IN ('QUEUED', 'RUNNING'))       AS pending,
        (SELECT count(*) FROM submissions
           WHERE status = 'SYSTEM_ERROR')               AS failed,
        (SELECT count(*) FROM rounds
           WHERE state = 'LIVE')                        AS live_rounds
    `;

    // Postgres count() returns bigint, which does not survive JSON serialisation.
    return {
      competitions: Number(row.competitions),
      participants: Number(row.participants),
      submissions: Number(row.submissions),
      pendingSubmissions: Number(row.pending),
      failedSubmissions: Number(row.failed),
      liveRounds: Number(row.live_rounds),
    };
  }

  async auditLog(limit = 100) {
    return this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 500),
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        metadata: true,
        ipAddress: true,
        createdAt: true,
        actor: { select: { id: true, email: true } },
      },
    });
  }

  async listUsers(search?: string, role?: Role) {
    return this.prisma.user.findMany({
      where: {
        ...(role ? { role } : {}),
        ...(search
          ? {
              OR: [
                { email: { contains: search, mode: 'insensitive' as const } },
                { profile: { displayName: { contains: search, mode: 'insensitive' as const } } },
              ],
            }
          : {}),
      },
      orderBy: [{ role: 'desc' }, { createdAt: 'asc' }],
      take: 200,
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        emailVerified: true,
        lastLoginAt: true,
        createdAt: true,
        profile: { select: { displayName: true, country: true } },
      },
    });
  }

  /// Changing a role is the most consequential action in the product, so it is
  /// audited unconditionally and defended against the two ways an operator can
  /// lock everyone out.
  async setUserRole(actorId: string, targetId: string, role: Role, request: RequestContext) {
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, email: true, role: true },
    });

    if (!target) throw new NotFoundException('User not found');

    if (target.role === role) {
      return { id: target.id, role: target.role, changed: false };
    }

    // Guard 1: no self-demotion. An operator who demotes themselves cannot undo
    // it, because undoing it requires the privilege they just gave away.
    if (actorId === targetId && role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('You cannot remove your own super admin role');
    }

    // Guard 2: never remove the last super admin, or the platform has no one who
    // can appoint another.
    if (target.role === Role.SUPER_ADMIN && role !== Role.SUPER_ADMIN) {
      const remaining = await this.prisma.user.count({
        where: { role: Role.SUPER_ADMIN, isActive: true, id: { not: targetId } },
      });
      if (remaining === 0) {
        throw new BadRequestException(
          'This is the only super admin. Promote someone else before changing this role.',
        );
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: targetId },
      data: { role },
      select: { id: true, email: true, role: true },
    });

    await this.audit.record({
      actorId,
      action: 'admin.user.role_changed',
      entityType: 'User',
      entityId: targetId,
      metadata: { email: target.email, from: target.role, to: role },
      ipAddress: request.ip,
      userAgent: request.userAgent,
    });

    return { ...updated, changed: true };
  }

  async setUserActive(
    actorId: string,
    targetId: string,
    isActive: boolean,
    request: RequestContext,
  ) {
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, email: true, role: true, isActive: true },
    });

    if (!target) throw new NotFoundException('User not found');

    if (actorId === targetId && !isActive) {
      throw new ForbiddenException('You cannot deactivate your own account');
    }

    if (target.role === Role.SUPER_ADMIN && !isActive) {
      const remaining = await this.prisma.user.count({
        where: { role: Role.SUPER_ADMIN, isActive: true, id: { not: targetId } },
      });
      if (remaining === 0) {
        throw new BadRequestException('This is the only active super admin.');
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: targetId },
      data: { isActive },
      select: { id: true, email: true, isActive: true },
    });

    // Deactivation takes effect on the next request rather than at token expiry,
    // because JwtStrategy.validate() re-reads isActive from the database.
    await this.audit.record({
      actorId,
      action: isActive ? 'admin.user.reactivated' : 'admin.user.deactivated',
      entityType: 'User',
      entityId: targetId,
      metadata: { email: target.email },
      ipAddress: request.ip,
      userAgent: request.userAgent,
    });

    return updated;
  }
}


