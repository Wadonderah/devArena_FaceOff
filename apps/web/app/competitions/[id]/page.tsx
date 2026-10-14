'use client';

import Link from 'next/link';
import { use } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAskToJoin, useWithdrawJoinRequest } from '@/lib/hooks';
import { AuthGate } from '@/components/auth-gate';
import { Shell } from '@/components/shell';
import { Button } from '@/components/ui/button';
import { Badge, CompetitionStateBadge, RoundStateBadge } from '@/components/ui/badge';
import { Skeleton, SkeletonRows } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Field } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api';
import { useCompetition, useCountdown } from '@/lib/hooks';
import { ROUND_PATH } from '@/lib/taxonomy';
import { registrationGate } from '@/lib/registration';
import type { RoundSummary, Team, TeamListItem } from '@/lib/types';

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

  const href = `/rounds/${round.id}/${ROUND_PATH[round.type]}`;
  const open = round.state === 'LIVE' && competitionJoined;

  return (
    <li className="panel hairline p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-[12px] uppercase tracking-[0.12em] text-brand-bright">
              Round {round.orderIndex + 1}
            </span>
            <RoundStateBadge state={round.state} />
            {round.participationMode && round.participationMode !== 'INDIVIDUAL' && (
              <Badge tone="brand">Team scored</Badge>
            )}
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

function TeamPanel({
  competitionId,
  joined,
  maxTeamSize,
}: {
  competitionId: string;
  joined: boolean;
  maxTeamSize?: number | null;
}) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data: team, isLoading } = useQuery({
    queryKey: ['my-team', competitionId],
    queryFn: () => api<Team | null>(`/competitions/${competitionId}/teams/mine`),
    enabled: joined,
    retry: false,
  });

  const { data: allTeams } = useQuery({
    queryKey: ['teams', competitionId],
    queryFn: () => api<TeamListItem[]>(`/competitions/${competitionId}/teams`),
    enabled: joined,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['my-team', competitionId] });
    queryClient.invalidateQueries({ queryKey: ['teams', competitionId] });
  };

  const fail = (err: unknown, fallback: string) =>
    toast.error(fallback, err instanceof ApiError ? err.displayMessage : 'Please try again.');

  const create = useMutation({
    mutationFn: () =>
      api<Team>(`/competitions/${competitionId}/teams`, { method: 'POST', body: { name } }),
    onSuccess: (created) => {
      toast.success(`${created.name} created`, `Share code ${created.code} to invite others.`);
      setName('');
      refresh();
    },
    onError: (err) => fail(err, 'Could not create the team'),
  });

  const ask = useAskToJoin(competitionId);
  const withdraw = useWithdrawJoinRequest(competitionId);

  const join = useMutation({
    mutationFn: (joinCode: string) =>
      api<Team>('/teams/join', { method: 'POST', body: { code: joinCode } }),
    onSuccess: (joined_) => {
      toast.success(`You joined ${joined_.name}`);
      setCode('');
      refresh();
    },
    onError: (err) => fail(err, 'Could not join that team'),
  });

  if (!joined) return null;
  if (isLoading) return <Skeleton className="mb-6 h-32 w-full rounded-xl" />;

  // Already in a team: show it, and make the one-team-per-competition rule and
  // the way out of it both visible. Previously this looked like a dead end.
  if (team) {
    return (
      <section className="panel hairline mb-6 flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-faint">
            Your team
          </p>
          <h2 className="mt-1 text-xl">{team.name}</h2>
          <p className="mt-0.5 text-[13px] text-ink-faint">
            {team.members.length}
            {maxTeamSize ? ` of ${maxTeamSize}` : ''} members · code{' '}
            <span className="font-mono">{team.code}</span>
          </p>
          <p className="mt-2 text-[13px] text-ink-dim">
            You can only be in one team per competition. Leave this one first if you want to
            switch.
          </p>
        </div>
        <Link href={`/teams/${team.id}`}>
          <Button variant="secondary">Manage team</Button>
        </Link>
      </section>
    );
  }

  const teams = allTeams ?? [];

  return (
    <section className="panel hairline mb-6 p-4 sm:p-5">
      <h2 className="text-lg">Teams</h2>
      <p className="mt-1 text-[14px] text-ink-dim">
        Team rounds score through your team, so join one before they start. You can be in one team
        per competition.
      </p>

      {teams.length > 0 && (
        <div className="mt-5">
          <h3 className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-faint">
            Teams in this competition
          </h3>
          <ul className="mt-2.5 grid gap-2 sm:grid-cols-2">
            {teams.map((t) => {
              const full = maxTeamSize ? t._count.members >= maxTeamSize : false;
              return (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-1 px-3.5 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[14px]">{t.name}</p>
                    <p className="text-[12px] text-ink-faint">
                      {t._count.members}
                      {maxTeamSize ? ` / ${maxTeamSize}` : ''} members
                    </p>
                  </div>
                  {full ? (
                    <Badge>Full</Badge>
                  ) : t.pendingRequest ? (
                    <span className="flex shrink-0 items-center gap-1.5">
                      <Badge tone="brand" dot>
                        Requested
                      </Badge>
                      <button
                        type="button"
                        onClick={() =>
                          withdraw.mutate(t.id, {
                            onError: (err) => fail(err, 'Could not withdraw that request'),
                          })
                        }
                        disabled={withdraw.isPending}
                        className="text-[12px] text-ink-faint underline underline-offset-4 transition-colors hover:text-ink-dim disabled:opacity-50"
                      >
                        Withdraw
                      </button>
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="shrink-0"
                      loading={ask.isPending && ask.variables?.teamId === t.id}
                      onClick={() =>
                        ask.mutate(
                          { teamId: t.id },
                          {
                            onSuccess: () =>
                              toast.success(
                                'Request sent',
                                `${t.captainName ?? 'The captain'} has been notified.`,
                              ),
                            onError: (err) => fail(err, 'Could not send that request'),
                          },
                        )
                      }
                    >
                      Ask to join
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-2.5 text-[13px] leading-relaxed text-ink-faint">
            Ask a captain to let you in, or join straight away with an invite code they share
            with you. Either way the captain decides who is on their team.
          </p>
        </div>
      )}

      <div className="mt-6 grid gap-5 border-t border-line pt-4 sm:pt-5 sm:grid-cols-2">
        <form
          className="space-y-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <Field
            label="Create a team"
            placeholder="Team name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" size="sm" loading={create.isPending} disabled={!name.trim()}>
            Create
          </Button>
        </form>

        <form
          className="space-y-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            join.mutate(code);
          }}
        >
          <Field
            label="Join with a code"
            placeholder="ABC234"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            hint="Case and spacing do not matter."
          />
          <Button
            type="submit"
            size="sm"
            variant="secondary"
            loading={join.isPending}
            disabled={!code.trim()}
          >
            Join
          </Button>
        </form>
      </div>
    </section>
  );
}

function CompetitionContent({ id }: { id: string }) {
  const { data, isLoading, error } = useCompetition(id);
  const queryClient = useQueryClient();
  const toast = useToast();

  const join = useMutation({
    mutationFn: () => api(`/competitions/${id}/join`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('You have joined', 'You can now take part in this competition\u2019s rounds.');
      queryClient.invalidateQueries({ queryKey: ['competition', id] });
      queryClient.invalidateQueries({ queryKey: ['competitions'] });
    },
    onError: (error) =>
      toast.error(
        'Could not join',
        error instanceof ApiError ? error.displayMessage : undefined,
      ),
  });

  if (isLoading) return <SkeletonRows rows={4} />;

  if (error) {
    return (
      <div className="panel p-6 sm:p-10 text-center">
        <h1 className="text-lg">Competition unavailable</h1>
        <p className="mt-2 text-[14px] text-ink-dim">
          {error instanceof ApiError ? error.displayMessage : 'Please try again.'}
        </p>
      </div>
    );
  }

  if (!data) return null;

  // The window, not just the state. A competition can sit in REGISTRATION with
  // its window still days away, and keying the button on `state` alone offered
  // a Join that the server then refused with "Registration has not opened yet".
  const gate = registrationGate(data);
  const canJoin = data.joined === false && gate.joinable;

  // Shown in place of the button: say when it opens rather than leaving a
  // participant with nothing on the page to explain why they cannot enrol.
  const blockedReason =
    data.joined === false && !gate.joinable && gate.reason !== 'draft' ? gate.detail : null;

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
          {blockedReason && (
            <p className="self-center rounded-lg border border-line bg-surface-2 px-3 py-2 text-[13px] text-ink-dim">
              {blockedReason}
            </p>
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

      <TeamPanel
        competitionId={id}
        joined={Boolean(data.joined)}
        maxTeamSize={data.maxTeamSize}
      />

      <h2 className="mb-3 text-[12px] uppercase tracking-[0.1em] text-ink-faint">Rounds</h2>

      {data.rounds.length === 0 ? (
        <div className="panel p-5 sm:p-8 text-center text-[14px] text-ink-dim">
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
