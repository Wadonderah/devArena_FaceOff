import { NotFoundException } from '@nestjs/common';
import { CompetitionState } from '@prisma/client';
import { LeaderboardService } from './leaderboard.service';
import type { PrismaService } from '../prisma/prisma.service';

const COMPETITION = {
  id: 'comp-1',
  name: 'Face-Off S1',
  state: CompetitionState.LIVE,
};

function makePrisma(rows: unknown[]) {
  const queryRaw = jest.fn().mockResolvedValue(rows);
  const findFirst = jest.fn().mockResolvedValue(COMPETITION);
  return {
    queryRaw,
    findFirst,
    asPrisma: {
      $queryRaw: queryRaw,
      competition: { findFirst },
    } as unknown as PrismaService,
  };
}

const row = (over: Record<string, unknown> = {}) => ({
  rank: 1n,
  user_id: 'u1',
  display_name: 'Ama Boateng',
  country: 'Ghana',
  final_score: '0.4',
  completed: 4n,
  total_time_ms: 255685n,
  last_scored_at: new Date('2026-08-25T22:00:00Z'),
  ...over,
});

describe('LeaderboardService', () => {
  it('converts the driver bigints and decimals into plain numbers', async () => {
    const prisma = makePrisma([row()]);
    const { rows } = await new LeaderboardService(prisma.asPrisma).forCompetition('comp-1');

    expect(rows[0]).toMatchObject({
      rank: 1,
      userId: 'u1',
      displayName: 'Ama Boateng',
      finalScore: 0.4,
      completedChallenges: 4,
      totalTimeMs: 255685,
    });
    expect(typeof rows[0].rank).toBe('number');
    expect(typeof rows[0].totalTimeMs).toBe('number');
  });

  it('serves a repeat request from cache instead of re-querying', async () => {
    const prisma = makePrisma([row()]);
    const service = new LeaderboardService(prisma.asPrisma);

    await service.forCompetition('comp-1');
    await service.forCompetition('comp-1');
    await service.forCompetition('comp-1');

    // The competition lookup runs each time; the ranking query does not.
    expect(prisma.queryRaw).toHaveBeenCalledTimes(1);
  });

  it('re-queries after the cache is invalidated by a new score', async () => {
    const prisma = makePrisma([row()]);
    const service = new LeaderboardService(prisma.asPrisma);

    await service.forCompetition('comp-1');
    service.invalidate('comp-1');
    await service.forCompetition('comp-1');

    expect(prisma.queryRaw).toHaveBeenCalledTimes(2);
  });

  it('caches each competition separately', async () => {
    const prisma = makePrisma([row()]);
    const service = new LeaderboardService(prisma.asPrisma);

    await service.forCompetition('comp-1');
    service.invalidate('comp-2');
    await service.forCompetition('comp-1');

    expect(prisma.queryRaw).toHaveBeenCalledTimes(1);
  });

  it('hides a draft competition', async () => {
    const prisma = makePrisma([]);
    prisma.findFirst.mockResolvedValue(null);

    await expect(
      new LeaderboardService(prisma.asPrisma).forCompetition('comp-1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('reports a participant who has not scored rather than omitting them', async () => {
    const prisma = makePrisma([
      row(),
      row({
        rank: 2n,
        user_id: 'u2',
        display_name: 'Kwame Mensah',
        final_score: '0',
        completed: 0n,
        total_time_ms: 0n,
        last_scored_at: null,
      }),
    ]);

    const { rows } = await new LeaderboardService(prisma.asPrisma).forCompetition('comp-1');

    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ finalScore: 0, completedChallenges: 0, lastScoredAt: null });
  });

  it('never exposes submission code or contact details', async () => {
    const prisma = makePrisma([row()]);
    const { rows } = await new LeaderboardService(prisma.asPrisma).forCompetition('comp-1');

    const keys = Object.keys(rows[0]);
    expect(keys).not.toContain('email');
    expect(keys).not.toContain('sourceCode');
  });
});
