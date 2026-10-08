'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { formatScore, placing } from '@/lib/score-format';
import type { Team, TeamLeaderboard } from '@/lib/types';
import { cn } from '@/lib/cn';

/// Your team and where it stands, without having to go and find it. Renders
/// nothing when the participant is not in a team for this competition.
///
/// Rewritten because the previous version read as generated, and for three
/// specific reasons worth keeping out of the next thing built here:
///
///   - Three identical uppercase micro-labels sat side by side, which is a
///     template signature rather than a hierarchy.
///   - The numbers used three type families and three sizes between them, so
///     variety stood in for emphasis.
///   - The score was `toFixed(4)` — "0.4000" — the raw internal fraction. It is
///     now a percentage, which is what the number actually means.
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

  if (isLoading) return <Skeleton className="h-28 w-full rounded-xl" />;
  if (!team) return null;

  const standing = board?.rows.find((row) => row.teamId === team.id);
  const field = board?.rows.length ?? 0;

  return (
    <section className="panel hairline p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <p className="text-[12px] text-ink-faint">Your team</p>
          <h2 className="mt-0.5 truncate text-xl">{team.name}</h2>

          <p className="mt-1 inline-flex items-center gap-1.5 text-[13px] text-ink-faint">
            <Users aria-hidden size={13} strokeWidth={1.5} />
            {team.members.length} {team.members.length === 1 ? 'member' : 'members'}
          </p>
        </div>

        <Link href={`/teams/${team.id}`} className="shrink-0">
          <Button variant="secondary" size="sm" icon={<ArrowRight />}>
            Manage
          </Button>
        </Link>
      </div>

      {standing && standing.completedChallenges === 0 ? (
        // Three zeros in a row look like a bug. They usually are not: a score is
        // attributed to a team at the moment it is recorded, from the member's
        // team AT THAT TIME, so work done before joining — or in a round the
        // organizer set to INDIVIDUAL — never counts towards the team. Saying so
        // is more useful than rendering 0, 0%, 0.
        <p className="mt-4 border-t border-line pt-3.5 text-[13px] leading-relaxed text-ink-faint">
          No team scores yet. Only rounds the organizer set to team scoring count here, and only
          work done after you joined.
        </p>
      ) : (
        standing && (
          // One row, one type family, with the figure carrying the emphasis and
          // the label kept quiet beneath it. Wraps rather than squeezing on a
          // narrow screen.
          <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3 border-t border-line pt-3.5">
            <Stat
              value={placing(standing.rank, field)}
              label="Position"
              highlight={standing.rank === 1}
            />
            <Stat value={formatScore(standing.finalScore)} label="Of the competition" />
            {/* "Challenges solved" read as coding problems, but each MCQ
                question is its own Challenge row, so four correct answers showed
                as "4 challenges solved". "Solved" claims less and is true of
                both. */}
            <Stat value={String(standing.completedChallenges)} label="Solved" />
          </div>
        )
      )}
    </section>
  );
}

function Stat({
  value,
  label,
  highlight,
}: {
  value: string;
  label: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <p className={cn('tabular text-lg leading-none', highlight && 'text-live')}>{value}</p>
      <p className="mt-1 text-[12px] text-ink-faint">{label}</p>
    </div>
  );
}
