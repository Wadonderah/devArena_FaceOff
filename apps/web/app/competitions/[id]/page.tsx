'use client';

import Link from 'next/link';
import { use } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AuthGate } from '@/components/auth-gate';
import { Shell } from '@/components/shell';
import { Button } from '@/components/ui/button';
import { CompetitionStateBadge, RoundStateBadge } from '@/components/ui/badge';
import { SkeletonRows } from '@/components/ui/skeleton';
import { api, ApiError } from '@/lib/api';
import { useCompetition, useCountdown } from '@/lib/hooks';
import type { RoundSummary } from '@/lib/types';

function RoundCard({
  round,
  competitionJoined,
}: {
  round: RoundSummary;
  competitionJoined: boolean;
}) {
  const { remainingMs, label } = useCountdown(
    round.state === 'LIVE' ? round.endsAt : null,
  );

  const href = `/rounds/${round.id}/${round.type === 'MCQ' ? 'mcq' : 'coding'}`;
  const open = round.state === 'LIVE' && competitionJoined;

  return (
    <li className="panel hairline p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-[12px] uppercase tracking-[0.12em] text-brand-bright">
              Round {round.orderIndex + 1}
            </span>
            <RoundStateBadge state={round.state} />
          </div>

          <h3 className="mt-1.5 text-lg">{round.name}</h3>

          {round.description && (
            <p className="mt-1 max-w-xl text-[14px] leading-relaxed text-ink-dim">
              {round.description}
            </p>
          )}

          <p className="mt-2 text-[13px] text-ink-faint">
            {round._count.challenges} {round.type === 'MCQ' ? 'questions' : 'problems'}
            {round.type === 'CODING' && round.allowedLanguages.length > 0 && (
              <> · {round.allowedLanguages.map((l) => l.toLowerCase()).join(', ')}</>
            )}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {remainingMs !== null && remainingMs > 0 && (
            <span
              className="tabular font-mono text-[15px] text-live"
              // The countdown updates every second; announcing each tick would
              // flood a screen reader, so it is presentational here.
              aria-hidden
            >
              {label}
            </span>
          )}

          {open ? (
            <Link href={href}>
              <Button size="sm">Enter</Button>
            </Link>
          ) : round.state === 'COMPLETED' && round.type === 'MCQ' ? (
            <Link href={`${href}?view=results`}>
              <Button size="sm" variant="secondary">Results</Button>
            </Link>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function CompetitionContent({ id }: { id: string }) {
  const { data, isLoading, error } = useCompetition(id);
  const queryClient = useQueryClient();

  const join = useMutation({
    mutationFn: () => api(`/competitions/${id}/join`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['competition', id] }),
  });

  if (isLoading) return <SkeletonRows rows={4} />;

  if (error) {
    return (
      <div className="panel p-10 text-center">
        <h1 className="text-lg">Competition unavailable</h1>
        <p className="mt-2 text-[14px] text-ink-dim">
          {error instanceof ApiError ? error.displayMessage : 'Please try again.'}
        </p>
      </div>
    );
  }

  if (!data) return null;

  const canJoin =
    data.joined === false &&
    (data.state === 'REGISTRATION' || data.state === 'LIVE');

  return (
    <>
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-3xl">{data.name}</h1>
            <CompetitionStateBadge state={data.state} />
          </div>
          {data.description && (
            <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-dim">
              {data.description}
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <Link href={`/leaderboard/${data.id}`}>
            <Button variant="secondary">Leaderboard</Button>
          </Link>
          {canJoin && (
            <Button loading={join.isPending} onClick={() => join.mutate()}>
              Join competition
            </Button>
          )}
        </div>
      </header>

      {join.error && (
        <p role="alert" className="mb-5 rounded-lg border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-[14px] text-danger">
          {join.error instanceof ApiError ? join.error.displayMessage : 'Could not join.'}
        </p>
      )}

      {data.joined && (
        <p className="mb-5 rounded-lg border border-success/30 bg-success/10 px-3.5 py-2.5 text-[14px] text-success">
          You&apos;re registered for this competition.
        </p>
      )}

      <h2 className="mb-3 text-[12px] uppercase tracking-[0.1em] text-ink-faint">Rounds</h2>

      {data.rounds.length === 0 ? (
        <div className="panel p-8 text-center text-[14px] text-ink-dim">
          Rounds will appear here once the organizer publishes them.
        </div>
      ) : (
        <ul className="space-y-3">
          {data.rounds.map((round) => (
            <RoundCard key={round.id} round={round} competitionJoined={Boolean(data.joined)} />
          ))}
        </ul>
      )}
    </>
  );
}

export default function CompetitionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <AuthGate>
      <Shell>
        <CompetitionContent id={id} />
      </Shell>
    </AuthGate>
  );
}
