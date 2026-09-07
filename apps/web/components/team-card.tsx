'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import type { Team, TeamLeaderboard } from '@/lib/types';
import { cn } from '@/lib/cn';

/// Your team and where it stands, without having to go and find it. Renders
/// nothing when the participant is not in a team for this competition.
export function TeamCard({ competitionId }: { competitionId: string }) {
  const { data: team, isLoading } = useQuery({
    queryKey: ['my-team', competitionId],
    queryFn: () => api<Team | null>(`/competitions/${competitionId}/teams/mine`),
    retry: false,
  });

  const { data: board } = useQuery({
    queryKey: ['leaderboard-teams', competitionId],
    queryFn: () => api<TeamLeaderboard>(`/leaderboard/${competitionId}/teams`),
    enabled: Boolean(team),
    refetchInterval: 15_000,
  });

  if (isLoading) return <Skeleton className="h-32 w-full rounded-[14px]" />;
  if (!team) return null;

  const standing = board?.rows.find((row) => row.teamId === team.id);

  return (
    <section className="panel hairline flex flex-wrap items-center justify-between gap-5 p-5">
      <div className="min-w-0">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-faint">
          Your team
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2.5">
          <h2 className="text-xl">{team.name}</h2>
          <Badge>{team.members.length} members</Badge>
        </div>
        <p className="mt-1 text-[13px] text-ink-faint">
          Invite code <span className="font-mono">{team.code}</span>
        </p>
      </div>

      {standing && (
        <div className="flex items-center gap-7">
          <div className="text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-faint">
              Rank
            </p>
            <p
              className={cn(
                'tabular mt-0.5 font-display text-3xl font-bold leading-none',
                standing.rank === 1 && 'text-live',
              )}
            >
              {standing.rank}
            </p>
          </div>
          <div className="text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-faint">
              Score
            </p>
            <p className="tabular mt-0.5 font-mono text-2xl leading-none">
              {standing.finalScore.toFixed(4)}
            </p>
          </div>
          <div className="text-center">
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-faint">
              Solved
            </p>
            <p className="tabular mt-0.5 font-mono text-2xl leading-none text-ink-dim">
              {standing.completedChallenges}
            </p>
          </div>
        </div>
      )}

      <Link href={`/teams/${team.id}`}>
        <Button variant="secondary">Manage team</Button>
      </Link>
    </section>
  );
}
