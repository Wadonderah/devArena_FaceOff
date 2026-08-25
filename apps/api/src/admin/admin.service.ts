import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LeaderboardService } from '../leaderboard/leaderboard.service';
import { toCsv } from './csv';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leaderboard: LeaderboardService,
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

  async overview() {
    const [competitions, participants, submissions, pendingSubmissions, failedSubmissions] =
      await Promise.all([
        this.prisma.competition.count(),
        this.prisma.competitionParticipant.count(),
        this.prisma.submission.count(),
        this.prisma.submission.count({ where: { status: { in: ['QUEUED', 'RUNNING'] } } }),
        this.prisma.submission.count({ where: { status: 'SYSTEM_ERROR' } }),
      ]);

    return { competitions, participants, submissions, pendingSubmissions, failedSubmissions };
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
}
