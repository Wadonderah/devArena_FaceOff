import { Injectable, NotFoundException } from '@nestjs/common';
import { CompetitionState } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface TeamLeaderboardRow {
  rank: number;
  teamId: string;
  name: string;
  memberCount: number;
  finalScore: number;
  completedChallenges: number;
  totalTimeMs: number;
  lastScoredAt: Date | null;
}

export interface LeaderboardRow {
  rank: number;
  userId: string;
  displayName: string;
  country: string | null;
  finalScore: number;
  completedChallenges: number;
  totalTimeMs: number;
  lastScoredAt: Date | null;
}

interface RawRow {
  rank: bigint;
  user_id: string;
  display_name: string;
  country: string | null;
  final_score: string;
  completed: bigint;
  total_time_ms: bigint;
  last_scored_at: Date | null;
}

const CACHE_TTL_MS = 2000;

@Injectable()
export class LeaderboardService {
  // In-process rather than Redis: the app runs as a single instance, so this is
  // correct, and it keeps the Upstash command budget for BullMQ. At ~25 people
  // polling every 3s this collapses roughly 8 req/s into one query every 2s.
  private readonly cache = new Map<string, { at: number; rows: LeaderboardRow[] }>();
  private readonly teamCache = new Map<string, { at: number; rows: TeamLeaderboardRow[] }>();

  constructor(private readonly prisma: PrismaService) {}

  async forCompetition(competitionId: string): Promise<{
    competition: { id: string; name: string; state: CompetitionState };
    rows: LeaderboardRow[];
    generatedAt: Date;
  }> {
    const competition = await this.prisma.competition.findFirst({
      where: { id: competitionId, state: { not: CompetitionState.DRAFT } },
      select: { id: true, name: true, state: true },
    });

    if (!competition) throw new NotFoundException('Competition not found');

    return {
      competition,
      rows: await this.rankedRows(competitionId),
      generatedAt: new Date(),
    };
  }

  /// Team standings for a competition. Only teams are ranked here; the
  /// individual board remains available separately, which is what a HYBRID
  /// competition needs.
  async teamsForCompetition(competitionId: string): Promise<{
    competition: { id: string; name: string; state: CompetitionState };
    rows: TeamLeaderboardRow[];
    generatedAt: Date;
  }> {
    const competition = await this.prisma.competition.findFirst({
      where: { id: competitionId, state: { not: CompetitionState.DRAFT } },
      select: { id: true, name: true, state: true },
    });

    if (!competition) throw new NotFoundException('Competition not found');

    return {
      competition,
      rows: await this.rankedTeamRows(competitionId),
      generatedAt: new Date(),
    };
  }

  invalidate(competitionId: string): void {
    this.cache.delete(competitionId);
    this.teamCache.delete(competitionId);
  }

  private async rankedRows(competitionId: string): Promise<LeaderboardRow[]> {
    const cached = this.cache.get(competitionId);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      return cached.rows;
    }

    const rows = await this.query(competitionId);
    this.cache.set(competitionId, { at: Date.now(), rows });
    return rows;
  }

  /// Ranking is computed in one statement so every participant is ordered by the
  /// same snapshot of the data. Tie-breaks are applied in the documented order:
  /// score desc, challenges completed desc, total time asc, earliest to reach
  /// that score asc. RANK() (not ROW_NUMBER) so genuinely tied participants share
  /// a position rather than being separated arbitrarily.
  ///
  /// Enrolled participants with no score events are included at zero via the LEFT
  /// JOIN, so the board shows the whole field rather than only those who scored.
  private async query(competitionId: string): Promise<LeaderboardRow[]> {
    const raw = await this.prisma.$queryRaw<RawRow[]>`
      WITH aggregated AS (
        SELECT
          cp."userId"                                            AS user_id,
          COALESCE(SUM(se."weightedScore"), 0)                   AS final_score,
          COUNT(se.id) FILTER (WHERE se."rawScore" > 0)          AS completed,
          COALESCE(SUM(se."timeToSolveMs"), 0)                   AS total_time_ms,
          MAX(se."createdAt")                                    AS last_scored_at
        FROM competition_participants cp
        LEFT JOIN score_events se
          ON se."userId" = cp."userId"
         AND se."competitionId" = cp."competitionId"
        WHERE cp."competitionId" = ${competitionId}::uuid
        GROUP BY cp."userId"
      )
      SELECT
        RANK() OVER (
          ORDER BY
            a.final_score     DESC,
            a.completed       DESC,
            a.total_time_ms   ASC,
            a.last_scored_at  ASC NULLS LAST
        ) AS rank,
        a.user_id,
        p."displayName" AS display_name,
        p.country,
        a.final_score,
        a.completed,
        a.total_time_ms,
        a.last_scored_at
      FROM aggregated a
      JOIN profiles p ON p."userId" = a.user_id
      ORDER BY rank ASC, display_name ASC
    `;

    return raw.map((row) => ({
      rank: Number(row.rank),
      userId: row.user_id,
      displayName: row.display_name,
      country: row.country,
      finalScore: Number(row.final_score),
      completedChallenges: Number(row.completed),
      totalTimeMs: Number(row.total_time_ms),
      lastScoredAt: row.last_scored_at,
    }));
  }

  private async rankedTeamRows(competitionId: string): Promise<TeamLeaderboardRow[]> {
    const cached = this.teamCache.get(competitionId);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      return cached.rows;
    }

    const rows = await this.queryTeams(competitionId);
    this.teamCache.set(competitionId, { at: Date.now(), rows });
    return rows;
  }

  /// Mirrors the individual query: one statement, RANK() rather than
  /// ROW_NUMBER() so genuine ties share a position, and the same documented
  /// tie-break chain. Teams with no score yet appear at zero via the LEFT JOIN
  /// rather than vanishing from the board.
  ///
  /// A team's score is the SUM of its members' weighted scores, per the build
  /// document. That advantages larger teams, which is why Competition.maxTeamSize
  /// exists — an organizer running team rounds should cap it.
  private async queryTeams(competitionId: string): Promise<TeamLeaderboardRow[]> {
    const raw = await this.prisma.$queryRaw<
      {
        rank: bigint;
        team_id: string;
        name: string;
        member_count: bigint;
        final_score: string;
        completed: bigint;
        total_time_ms: bigint;
        last_scored_at: Date | null;
      }[]
    >`
      WITH aggregated AS (
        SELECT
          t.id                                                   AS team_id,
          t.name                                                 AS name,
          (SELECT count(*) FROM team_members m WHERE m."teamId" = t.id) AS member_count,
          COALESCE(SUM(se."weightedScore"), 0)                   AS final_score,
          COUNT(se.id) FILTER (WHERE se."rawScore" > 0)          AS completed,
          COALESCE(SUM(se."timeToSolveMs"), 0)                   AS total_time_ms,
          MAX(se."createdAt")                                    AS last_scored_at
        FROM teams t
        LEFT JOIN score_events se
          ON se."teamId" = t.id
         AND se."competitionId" = t."competitionId"
        WHERE t."competitionId" = ${competitionId}::uuid
        GROUP BY t.id, t.name
      )
      SELECT
        RANK() OVER (
          ORDER BY
            a.final_score     DESC,
            a.completed       DESC,
            a.total_time_ms   ASC,
            a.last_scored_at  ASC NULLS LAST
        ) AS rank,
        a.team_id,
        a.name,
        a.member_count,
        a.final_score,
        a.completed,
        a.total_time_ms,
        a.last_scored_at
      FROM aggregated a
      ORDER BY rank ASC, name ASC
    `;

    return raw.map((row) => ({
      rank: Number(row.rank),
      teamId: row.team_id,
      name: row.name,
      memberCount: Number(row.member_count),
      finalScore: Number(row.final_score),
      completedChallenges: Number(row.completed),
      totalTimeMs: Number(row.total_time_ms),
      lastScoredAt: row.last_scored_at,
    }));
  }
}
